import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { z } from "zod";
import { createEngine } from "../../packages/game-core/index.ts";
import type { EngineControl, GameSnapshot, NormalizedEvent } from "../../packages/contracts/index.ts";
import { loadConfig, type RealtimeConfig } from "./config.ts";
import { MockLiveProvider, TikTokLiveProvider, type LiveProvider, type ProviderStatus } from "./provider.ts";
import { SnapshotStore } from "./store.ts";

const inputSchema = z.object({
  eventId: z.string().min(1).max(128).optional(),
  timestamp: z.number().int().positive().optional(),
  viewer: z.object({ providerUserId: z.string().min(1).max(128), username: z.string().min(1).max(80).optional(), nickname: z.string().min(1).max(120).optional() }).optional(),
  type: z.enum(["FOLLOW", "VIEWER_JOIN", "GIFT", "LIKE", "COMMENT", "SHARE", "VIEWER_COUNT"]),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();
const advanceSchema = z.object({ nowMs: z.number().int().nonnegative().optional() }).strict();
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FINAL_RUSH") }).strict(),
  z.object({ type: z.literal("RESET"), worldIndex: z.number().int().min(0).max(100).optional() }).strict(),
  z.object({ type: z.literal("PAUSE") }).strict(),
  z.object({ type: z.literal("RESUME") }).strict(),
  z.object({ type: z.literal("WORLD"), worldIndex: z.number().int().min(0).max(100).optional(), value: z.number().int().min(0).max(100).optional() }).strict(),
  z.object({ type: z.literal("EVENT"), value: z.string().min(1).max(80).optional() }).strict(),
  z.object({ type: z.literal("RULES"), rules: z.record(z.string(), z.unknown()).optional(), value: z.record(z.string(), z.unknown()).optional() }).strict(),
]);

type Engine = ReturnType<typeof createEngine>;
export interface RealtimeServer {
  httpServer: ReturnType<typeof createServer>;
  io: SocketIOServer;
  engine: Engine;
  provider: LiveProvider;
  store: SnapshotStore;
  config: RealtimeConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
}


function reply(callback: unknown, result: unknown): void { if (typeof callback === "function") callback(result); }

function tokenFrom(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const header = socket.handshake.headers["x-control-token"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  return typeof auth?.token === "string" ? auth.token : typeof headerValue === "string" ? headerValue : undefined;
}
function roleFor(socket: Socket, config: RealtimeConfig): "control" | "overlay" | "readonly" | "reject" {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const requested = auth?.role;
  const token = tokenFrom(socket);
  if (requested === "control") {
    return (!config.CONTROL_TOKEN || token === config.CONTROL_TOKEN) ? "control" : "reject";
  }
  if (requested === "overlay") {
    return config.OVERLAY_TOKEN && token === config.OVERLAY_TOKEN ? "overlay" : "reject";
  }
  // A configured overlay token protects the default read-only connection too.
  if (config.OVERLAY_TOKEN && token !== config.OVERLAY_TOKEN) return "reject";
  return "readonly";
}

export async function createRealtimeServer(config = loadConfig()): Promise<RealtimeServer> {
  const store = new SnapshotStore(config.DATABASE_URL);
  let restored: GameSnapshot | undefined;
  if (config.DATABASE_URL) {
    await store.init();
    restored = await store.load(config.SESSION_ID);
  }
  const engine = createEngine({ nowMs: Date.now(), initialState: restored, config: {} });
  const provider: LiveProvider = config.PROVIDER === "tiktok"
    ? new TikTokLiveProvider(config.SESSION_ID, config.TIKTOK_UNIQUE_ID!)
    : new MockLiveProvider(config.SESSION_ID);
  let persistenceHealthy = true;
  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      const body = JSON.stringify({ ok: true, sessionId: config.SESSION_ID, provider: provider.name, providerStatus: provider.getStatus?.() ?? "unknown", database: store.enabled ? (persistenceHealthy ? "connected" : "degraded") : "ephemeral", revision: engine.getSnapshot().revision });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(body); return;
    }
    if (req.method === "GET" && url.pathname === "/api/leaderboard") {
      void store.leaderboard(config.SESSION_ID, Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)))).then((rows) => { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ sessionId: config.SESSION_ID, rows })); }).catch(() => { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "database unavailable" })); }); return;
    }
    res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not_found" }));
  });
  const io = new SocketIOServer(httpServer, { maxHttpBufferSize: 32768, cors: { origin: config.WEB_ORIGIN, credentials: false }, transports: ["websocket", "polling"] });
  let providerStatus: ProviderStatus = "disconnected";
  let ticker: NodeJS.Timeout | undefined;
  let persistenceTimer: NodeJS.Timeout | undefined;
  let persistenceInFlight: Promise<void> | undefined;
  let persistenceQueued = false;
  let lastPersistAt = 0;
  const snapshot = (): GameSnapshot => engine.getSnapshot();
  const viewSnapshot = () => {
    const publicState = snapshot();
    delete publicState.dedup;
    const activeIds = new Set(publicState.players.map(player => player.id));
    const leaders = Object.entries(publicState.progress).sort((a,b)=>b[1].crowns-a[1].crowns||b[1].xp-a[1].xp).slice(0,100);
    for(const [id,stats] of Object.entries(publicState.progress)) if(activeIds.has(id)&&!leaders.some(entry=>entry[0]===id)) leaders.push([id,stats]);
    publicState.progress = Object.fromEntries(leaders);
    return { ...publicState, provider: provider.name, providerStatus };
  };
  let latestSnapshot = viewSnapshot();
  const publishSnapshot = () => {
    latestSnapshot = viewSnapshot();
    io.emit("snapshot", latestSnapshot);
    if (!store.enabled) return;
    if (persistenceInFlight) { persistenceQueued = true; return; }
    if (persistenceTimer) return;
    const delay = Math.max(0, 1000 - (Date.now() - lastPersistAt));
    persistenceTimer = setTimeout(() => {
      persistenceTimer = undefined;
      const toSave = snapshot();
      lastPersistAt = Date.now();
      persistenceInFlight = store.save(config.SESSION_ID, toSave).then(() => {persistenceHealthy=true;}).catch((error) => {persistenceHealthy=false;console.error("snapshot persistence failed", error);});
      void persistenceInFlight.then(() => {
        persistenceInFlight = undefined;
        if (persistenceQueued) { persistenceQueued = false; publishSnapshot(); }
      });
    }, delay);
  };
  const dispatch = (event: NormalizedEvent, receivedAtMs = Date.now()) => {
    engine.dispatch(event, receivedAtMs);
    io.emit("action", { event, snapshot: viewSnapshot() });
    publishSnapshot();
  };
  const unsubscribeEvent = provider.onEvent((event) => {
    try { dispatch(event, Date.now()); } catch (error) { console.error("provider event rejected", error); }
  });
  const unsubscribeStatus = provider.onStatus((status) => { providerStatus = status; io.emit("provider", { provider: provider.name, status }); publishSnapshot(); });

  io.use((socket, next) => {
    const role = roleFor(socket, config);
    if (role === "reject") return next(new Error("unauthorized"));
    socket.data.role = role;
    return next();
  });
  io.on("connection", (socket) => {
    let windowStarted = Date.now();
    let windowCount = 0;
    const withinRateLimit = () => {
      const now = Date.now();
      if (now - windowStarted >= 10_000) { windowStarted = now; windowCount = 0; }
      windowCount += 1;
      return windowCount <= 120;
    };
    socket.emit("snapshot", latestSnapshot);
    socket.emit("provider", { provider: provider.name, status: providerStatus });
    const input = (raw: unknown, acknowledge?: (result: unknown) => void) => {
      if (socket.data.role !== "control") return reply(acknowledge, { ok: false, error: "control_required" });
      if (!withinRateLimit()) return reply(acknowledge, { ok: false, error: "rate_limited" });
      if (config.PROVIDER !== "mock") return reply(acknowledge, { ok: false, error: "real_provider_is_read_only" });
      if (raw === undefined || JSON.stringify(raw).length > 16_384) return reply(acknowledge, { ok: false, error: "input_too_large" });
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) return reply(acknowledge, { ok: false, error: "invalid_input", issues: parsed.error.issues });
      const nowMs = Date.now();
      const viewer = parsed.data.viewer ? { providerUserId: parsed.data.viewer.providerUserId, username: parsed.data.viewer.username ?? parsed.data.viewer.providerUserId, nickname: parsed.data.viewer.nickname ?? parsed.data.viewer.username ?? parsed.data.viewer.providerUserId } : { providerUserId: "mock-viewer", username: "mock-viewer", nickname: "Mock Viewer" };
      const event = { eventId: parsed.data.eventId ?? `control-${socket.id}-${nowMs}`, platform: "mock", timestamp: parsed.data.timestamp ?? nowMs, sessionId: config.SESSION_ID, viewer, type: parsed.data.type, payload: parsed.data.payload };
      try { dispatch(event, nowMs); reply(acknowledge, { ok: true, eventId: event.eventId, snapshot: viewSnapshot() }); } catch { reply(acknowledge, { ok: false, error: "event_rejected" }); }
    };
    socket.on("control:input", input);
    // Backwards-compatible alias for the first web client protocol.
    socket.on("input", input);
    const command = (raw: unknown, acknowledge?: (result: unknown) => void) => {
      if (socket.data.role !== "control") return reply(acknowledge, { ok: false, error: "control_required" });
      if (!withinRateLimit()) return reply(acknowledge, { ok: false, error: "rate_limited" });
      if (raw === undefined || JSON.stringify(raw).length > 16_384) return reply(acknowledge, { ok: false, error: "input_too_large" });
      const parsed = commandSchema.safeParse(raw);
      if (!parsed.success) return reply(acknowledge, { ok: false, error: "invalid_command", issues: parsed.error.issues });
      try {
        const control: EngineControl = parsed.data.type === "WORLD"
          ? { type: "WORLD", worldIndex: parsed.data.worldIndex ?? parsed.data.value ?? 0 }
          : parsed.data.type === "RESET"
            ? { type: "RESET", ...(parsed.data.worldIndex === undefined ? {} : { worldIndex: parsed.data.worldIndex }) }
            : parsed.data.type === "EVENT"
              ? { type: "EVENT", value: parsed.data.value }
            : parsed.data.type === "RULES"
              ? { type: "RULES", rules: parsed.data.rules, value: parsed.data.value }
              : parsed.data;
        const next = engine.control(control, Date.now());
        io.emit("action", { command: control, snapshot: viewSnapshot() });
        publishSnapshot();
        reply(acknowledge, { ok: true, snapshot: { ...next, provider: provider.name, providerStatus } });
      } catch { reply(acknowledge, { ok: false, error: "command_rejected" }); }
    };
    socket.on("control:command", command);
    socket.on("control", command);
    socket.on("control:advance", (raw: unknown, acknowledge?: (result: unknown) => void) => {
      if (socket.data.role !== "control") return reply(acknowledge, { ok: false, error: "control_required" });
      if (config.NODE_ENV === "production") return reply(acknowledge, { ok: false, error: "advance_disabled" });
      if (!withinRateLimit()) return reply(acknowledge, { ok: false, error: "rate_limited" });
      const parsed = advanceSchema.safeParse(raw ?? {});
      if (!parsed.success) return reply(acknowledge, { ok: false, error: "invalid_input", issues: parsed.error.issues });
      try { engine.advance(parsed.data.nowMs ?? Date.now()); publishSnapshot(); reply(acknowledge, { ok: true, snapshot: latestSnapshot }); } catch { reply(acknowledge, { ok: false, error: "advance_rejected" }); }
    });
    socket.on("session:join", (raw: unknown, acknowledge?: (result: unknown) => void) => {
      const requestedSession = typeof raw === "string" ? raw : raw && typeof raw === "object" && "sessionId" in raw && typeof raw.sessionId === "string" ? raw.sessionId : undefined;
      if (requestedSession && requestedSession !== config.SESSION_ID) return reply(acknowledge, { ok: false, error: "unknown_session" });
      reply(acknowledge, { ok: true, sessionId: config.SESSION_ID, snapshot: latestSnapshot });
      socket.emit("snapshot", latestSnapshot);
    });
  });

  return {
    httpServer, io, engine, provider, store, config,
    async start() {
      if (config.DATABASE_URL && !store.enabled) throw new Error("DATABASE_URL was configured but Postgres is unavailable");
      await provider.start().catch((error) => { console.error("provider failed to start", error); });
      ticker = setInterval(() => { try { engine.advance(Date.now()); publishSnapshot(); } catch (error) { console.error("engine advance failed", error); } }, 100);
      await new Promise<void>((resolveStart, reject) => { httpServer.once("error", reject); httpServer.listen(config.PORT, "0.0.0.0", () => { httpServer.off("error", reject); resolveStart(); }); });
      const dbLabel = store.enabled ? "db=enabled" : "db=ephemeral";
      (store.enabled ? console.log : console.warn)(`realtime server listening on :${config.PORT} session=${config.SESSION_ID} provider=${provider.name} ${dbLabel}${store.enabled ? "" : " (state will be lost on restart)"}`);
    },
    async stop() {
      if (ticker) clearInterval(ticker);
      if (persistenceTimer) { clearTimeout(persistenceTimer); persistenceTimer = undefined; }
      persistenceQueued = false;
      unsubscribeEvent(); unsubscribeStatus();
      await provider.stop();
      await new Promise<void>((resolveStop) => io.close(() => resolveStop()));
      if (httpServer.listening) await new Promise<void>((resolveStop) => httpServer.close(() => resolveStop()));
      if (persistenceInFlight) await persistenceInFlight;
      if (store.enabled) await store.save(config.SESSION_ID, snapshot());
      await store.close();
    },
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const server = await createRealtimeServer();
  await server.start();
  const shutdown = async () => { await server.stop(); process.exit(0); };
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
}
