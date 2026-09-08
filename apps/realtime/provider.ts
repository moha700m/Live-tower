import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";
import type { NormalizedEvent } from "../../packages/contracts/index.ts";

export type ProviderStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type ProviderEventListener = (event: NormalizedEvent) => void;
export type ProviderStatusListener = (status: ProviderStatus, detail?: string) => void;

/** TikTok's connector expects the public handle, not the display-form @handle. */
export function normalizeTikTokUniqueId(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export interface LiveProvider {
  readonly name: "mock" | "tiktok";
  readonly sessionId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: ProviderEventListener): () => void;
  onStatus(listener: ProviderStatusListener): () => void;
  getStatus?(): ProviderStatus;
}

function stableId(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

type ConnectorRecord = Record<string, unknown>;
function record(value: unknown): ConnectorRecord { return value !== null && typeof value === "object" ? value as ConnectorRecord : {}; }
function field(value: unknown, key: string): unknown { return record(value)[key]; }

function userFrom(data: unknown) {
  const user = record(field(data, "user"));
  const id = String(user.userId ?? user.id ?? user.uniqueId ?? user.unique_id ?? "anonymous");
  const username = String(user.uniqueId ?? user.unique_id ?? id);
  const nickname = String(user.nickname ?? username);
  return { providerUserId: id, username, nickname };
}

export function normalizeTikTokEvent(sessionId: string, type: string, data: unknown, payload: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const viewer = userFrom(data);
  const sourceId = field(field(data, "common"), "msgId") ?? field(data, "eventId") ?? field(data, "msgId") ?? field(data, "messageId") ?? field(data, "id");
  return {
    eventId: `${sessionId}:${type}:${String(sourceId ?? stableId([sessionId, type, timestamp, viewer.providerUserId, payload]))}`,
    platform: "tiktok",
    timestamp,
    sessionId,
    viewer,
    type,
    payload,
  };
}

/** A deterministic, in-process source used for local development and integration tests. */
export class MockLiveProvider implements LiveProvider {
  readonly name = "mock" as const;
  private readonly events = new EventEmitter();
  private status: ProviderStatus = "disconnected";
  readonly sessionId: string;
  constructor(sessionId: string) { this.sessionId = sessionId; }

  async start() { this.setStatus("connected"); }
  async stop() { this.setStatus("disconnected"); }
  onEvent(listener: ProviderEventListener) { this.events.on("event", listener); return () => this.events.off("event", listener); }
  onStatus(listener: ProviderStatusListener) { this.events.on("status", listener); return () => this.events.off("status", listener); }
  emit(event: NormalizedEvent) { this.events.emit("event", event); }
  emitInput(type: string, viewer: Partial<{ providerUserId: string; username: string; nickname: string }> = {}, payload: Record<string, unknown> = {}) {
    const timestamp = Date.now();
    const completeViewer = { providerUserId: viewer.providerUserId ?? `mock-${Math.random().toString(36).slice(2, 8)}`, username: viewer.username ?? viewer.providerUserId ?? "mock-viewer", nickname: viewer.nickname ?? viewer.username ?? "Mock Viewer" };
    this.emit({ eventId: stableId([this.sessionId, type, timestamp, completeViewer.providerUserId, payload]), platform: "mock", timestamp, sessionId: this.sessionId, viewer: completeViewer, type, payload });
  }
  getStatus() { return this.status; }
  private setStatus(next: ProviderStatus) { this.status = next; this.events.emit("status", next); }
}

/**
 * Isolated TikTok adapter. It deliberately never accepts cookies, passwords, or
 * authenticated session options; connector access is anonymous and read-only.
 */
export class TikTokLiveProvider implements LiveProvider {
  readonly name = "tiktok" as const;
  private readonly events = new EventEmitter();
  private connection: TikTokLiveConnection | undefined;
  private status: ProviderStatus = "disconnected";
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopping = false;
  readonly sessionId: string;
  private readonly uniqueId: string;

  constructor(sessionId: string, uniqueId: string) { this.sessionId = sessionId; this.uniqueId = normalizeTikTokUniqueId(uniqueId); }

  async start() {
    this.stopping = false;
    if (this.connection) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    this.setStatus("connecting");
    const connection = new TikTokLiveConnection(this.uniqueId, {
      // No session/cookie/password options: this server only observes public LIVE events.
      fetchRoomInfoOnConnect: true,
      processInitialData: false,
      enableExtendedGiftInfo: true,
    });
    this.connection = connection;
    const on = (event: string, handler: (data: unknown) => void) => connection.on(event as never, handler as never);
    on(ControlEvent.CONNECTED, () => this.setStatus("connected"));
    on(ControlEvent.DISCONNECTED, (data) => {
      this.connection = undefined;
      const reason = String(field(data, "reason") ?? "disconnected");
      if (this.stopping) { this.setStatus("disconnected", reason || "stopped"); return; }
      this.setStatus("reconnecting", reason);
      if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.start().catch(() => undefined); }, 5000);
    });
    on(ControlEvent.ERROR, (data) => {
      const exception = record(field(data, "exception"));
      this.setStatus("reconnecting", String(exception.message ?? field(data, "message") ?? "provider error"));
    });
    on(WebcastEvent.MEMBER, (data) => this.publish(normalizeTikTokEvent(this.sessionId, "VIEWER_JOIN", data, { viewerCount: field(data, "memberCount") })));
    on(WebcastEvent.CHAT, (data) => this.publish(normalizeTikTokEvent(this.sessionId, "COMMENT", data, { comment: String(field(data, "content") ?? field(data, "comment") ?? "").slice(0, 500) })));
    on(WebcastEvent.LIKE, (data) => this.publish(normalizeTikTokEvent(this.sessionId, "LIKE", data, { count: Number(field(data, "count") ?? field(data, "likeCount") ?? 1), total: Number(field(data, "total") ?? field(data, "totalLikeCount") ?? 0) })));
    on(WebcastEvent.FOLLOW, (data) => this.publish(normalizeTikTokEvent(this.sessionId, "FOLLOW", data)));
    on(WebcastEvent.SHARE, (data) => this.publish(normalizeTikTokEvent(this.sessionId, "SHARE", data)));
    on(WebcastEvent.ROOM_USER, (data) => this.publish(normalizeTikTokEvent(this.sessionId, "VIEWER_COUNT", data, { count: Number(field(data, "total") ?? field(data, "totalUser") ?? field(data, "viewerCount") ?? 0) })));
    on(WebcastEvent.GIFT, (data) => this.handleGift(data));
    try {
      await connection.connect();
    } catch (error) {
      this.connection = undefined;
      connection.removeAllListeners();
      this.setStatus(this.stopping ? "disconnected" : "reconnecting", error instanceof Error ? error.message : String(error));
      if (!this.stopping && !this.reconnectTimer) this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.start().catch(() => undefined); }, 10_000);
      throw error;
    }
  }

  async stop() {
    this.stopping = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    const connection = this.connection;
    this.connection = undefined;
    if (connection) {
      try { await connection.disconnect(); } catch { /* already disconnected */ }
    }
    this.setStatus("disconnected");
  }
  onEvent(listener: ProviderEventListener) { this.events.on("event", listener); return () => this.events.off("event", listener); }
  onStatus(listener: ProviderStatusListener) { this.events.on("status", listener); return () => this.events.off("status", listener); }
  getStatus() { return this.status; }

  private handleGift(data: unknown) {
    const event = normalizeTikTokGift(this.sessionId, data);
    if (event) this.publish(event);
  }
  private publish(event: NormalizedEvent) { this.events.emit("event", event); }
  private setStatus(next: ProviderStatus, detail?: string) { this.status = next; this.events.emit("status", next, detail); }
}

/** Connector 2.x emits cumulative streak counts; apply only the terminal packet. */
export function normalizeTikTokGift(sessionId: string, data: unknown): NormalizedEvent | undefined {
  const gift = record(field(data, "gift"));
  const legacy = record(field(data, "giftDetails"));
  const giftType = Number(gift.type ?? legacy.giftType ?? field(data, "giftType") ?? 0);
  if (giftType === 1 && !field(data, "repeatEnd")) return;
  return normalizeTikTokEvent(sessionId, "GIFT", data, {
    giftId: String(field(data, "giftId") ?? gift.id ?? legacy.giftId ?? "unknown-gift"),
    giftName: gift.name ?? field(field(data, "extendedGiftInfo"), "name") ?? legacy.name ?? field(data, "giftName") ?? "Gift",
    repeatCount: Math.max(1, Math.min(100, Number(field(data, "repeatCount")) || 1)),
    repeatEnd: true,
    giftType,
  });
}
