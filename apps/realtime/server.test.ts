import test from "node:test";
import assert from "node:assert/strict";
import { createRealtimeServer } from "./server.ts";
import { io as connect } from "socket.io-client";
import type { GameSnapshot } from "../../packages/contracts/index.ts";
import type { RealtimeConfig } from "./config.ts";

type BridgeSnapshot = GameSnapshot & { provider?: string; providerStatus?: string };
type Ack = { ok: boolean; error?: string; eventId?: string; snapshot?: BridgeSnapshot };

const config = (): RealtimeConfig => ({ NODE_ENV: "test", PORT: 0, WEB_ORIGIN: "http://localhost:4173", SESSION_ID: "test", PROVIDER: "mock", CONTROL_TOKEN: undefined, OVERLAY_TOKEN: undefined, TIKTOK_UNIQUE_ID: undefined, DATABASE_URL: undefined, LOG_LEVEL: "error" });
const productionConfig = (): RealtimeConfig => ({ ...config(), NODE_ENV: "production", CONTROL_TOKEN: "control-secret", OVERLAY_TOKEN: "overlay-secret" });
async function listeningPort(server: Awaited<ReturnType<typeof createRealtimeServer>>) {
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}
async function connected(client: ReturnType<typeof connect>) {
  await new Promise<void>((resolve, reject) => { client.once("connect", () => resolve()); client.once("connect_error", reject); });
}

 test("mock Socket.IO control bridge dispatches an authoritative event", async () => {
  const server = await createRealtimeServer(config());
  await server.start();
  const client = connect(`http://localhost:${await listeningPort(server)}`, { auth: { role: "control" }, transports: ["websocket"] });
  try {
    await connected(client);
    const ack = await new Promise<Ack>((resolve) => client.emit("control:input", { type: "FOLLOW", viewer: { providerUserId: "viewer-1", username: "viewer", nickname: "Viewer" }, payload: {} }, resolve));
    assert.equal(ack.ok, true);
    assert.equal(ack.snapshot?.revision, 1);
    assert.ok((ack.snapshot?.feed.length ?? 0) >= 1);
    const command = await new Promise<Ack>((resolve) => client.emit("control:command", { type: "WORLD", worldIndex: 2 }, resolve));
    assert.equal(command.ok, true);
    assert.equal(command.snapshot?.worldIndex, 2);
    assert.equal(command.snapshot?.provider, "mock");
  } finally {
    client.close();
    await server.stop();
  }
});

test("read-only sockets cannot inject control input", async () => {
  const server = await createRealtimeServer(config());
  await server.start();
  const client = connect(`http://localhost:${await listeningPort(server)}`, { transports: ["websocket"] });
  try {
    await connected(client);
    const ack = await new Promise<Ack>((resolve) => client.emit("control:input", { type: "FOLLOW", payload: {} }, resolve));
    assert.deepEqual(ack, { ok: false, error: "control_required" });
  } finally {
    client.close();
    await server.stop();
  }
});

test("malformed acknowledgement from a read-only client cannot crash the service", async () => {
  const server = await createRealtimeServer(config()); await server.start();
  const client = connect(`http://localhost:${await listeningPort(server)}`, { transports: ["websocket"] });
  try {
    await connected(client);
    client.emit("control:input", { type: "FOLLOW" }, "not-a-function");
    client.emit("control:command", { type: "RESET" }, 42);
    client.emit("control:advance", {}, {});
    client.emit("session:join", { sessionId: "other" }, "bad");
    const ack = await new Promise<Ack>((resolve) => client.emit("control:input", { type: "FOLLOW" }, resolve));
    assert.equal(ack.error, "control_required");
    assert.equal(server.engine.getSnapshot().players.length, 0);
  } finally {
    client.close();
    await server.stop();
  }
});

test("production control and overlay sockets require their configured tokens", async () => {
  const server = await createRealtimeServer(productionConfig());
  await server.start();
  const origin = `http://localhost:${await listeningPort(server)}`;
  const badControl = connect(origin, { auth: { role: "control", token: "wrong" }, transports: ["websocket"], reconnection: false });
  const noOverlayToken = connect(origin, { transports: ["websocket"], reconnection: false });
  const control = connect(origin, { auth: { role: "control", token: "control-secret" }, transports: ["websocket"] });
  const overlay = connect(origin, { auth: { role: "overlay", token: "overlay-secret" }, transports: ["websocket"] });
  try {
    const badError = await new Promise<Error>((resolve) => badControl.once("connect_error", resolve));
    assert.match(badError.message, /unauthorized/i);
    const overlayError = await new Promise<Error>((resolve) => noOverlayToken.once("connect_error", resolve));
    assert.match(overlayError.message, /unauthorized/i);
    await Promise.all([connected(control), connected(overlay)]);
    const command = await new Promise<Ack>((resolve) => control.emit("control:command", { type: "WORLD", worldIndex: 4 }, resolve));
    assert.equal(command.ok, true);
    assert.equal(command.snapshot?.worldIndex, 4);
    const denied = await new Promise<Ack>((resolve) => overlay.emit("control:command", { type: "RESET" }, resolve));
    assert.deepEqual(denied, { ok: false, error: "control_required" });
    const health = await fetch(`${origin}/health`).then((response) => response.json()) as { ok: boolean; provider: string; database: string };
    assert.deepEqual({ ok: health.ok, provider: health.provider, database: health.database }, { ok: true, provider: "mock", database: "ephemeral" });
  } finally {
    badControl.close();
    noOverlayToken.close();
    control.close();
    overlay.close();
    await server.stop();
  }
});
