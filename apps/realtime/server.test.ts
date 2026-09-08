import test from "node:test";
import assert from "node:assert/strict";
import { createRealtimeServer } from "./server.ts";
import { io as connect } from "socket.io-client";
import type { GameSnapshot } from "../../packages/contracts/index.ts";

type BridgeSnapshot = GameSnapshot & { provider?: string; providerStatus?: string };
type Ack = { ok: boolean; error?: string; eventId?: string; snapshot?: BridgeSnapshot };

const config = () => ({ NODE_ENV: "test" as const, PORT: 0, WEB_ORIGIN: "http://localhost:4173", SESSION_ID: "test", PROVIDER: "mock" as const, CONTROL_TOKEN: undefined, OVERLAY_TOKEN: undefined, TIKTOK_UNIQUE_ID: undefined, DATABASE_URL: undefined, LOG_LEVEL: "error" as const });
async function listeningPort(server: Awaited<ReturnType<typeof createRealtimeServer>>) {
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

test("mock Socket.IO control bridge dispatches an authoritative event", async () => {
  const server = await createRealtimeServer(config());
  await server.start();
  const client = connect(`http://localhost:${await listeningPort(server)}`, { auth: { role: "control" }, transports: ["websocket"] });
  try {
    await new Promise<void>((resolve, reject) => { client.once("connect", () => resolve()); client.once("connect_error", reject); });
    const ack = await new Promise<Ack>((resolve) => client.emit("control:input", { type: "FOLLOW", viewer: { providerUserId: "viewer-1", username: "viewer", nickname: "Viewer" }, payload: {} }, resolve));
    assert.equal(ack.ok, true);
    assert.ok((ack.snapshot?.revision ?? 0) >= 1);
    assert.equal(ack.snapshot?.players.length, 1);
    assert.equal(ack.snapshot?.players[0]?.id, "mock:viewer-1");
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
    await new Promise<void>((resolve, reject) => { client.once("connect", () => resolve()); client.once("connect_error", reject); });
    const ack = await new Promise<Ack>((resolve) => client.emit("control:input", { type: "FOLLOW", payload: {} }, resolve));
    assert.deepEqual(ack, { ok: false, error: "control_required" });
  } finally {
    client.close();
    await server.stop();
  }
});

test('malformed acknowledgement from a read-only client cannot crash the service', async()=>{
 const server=await createRealtimeServer(config());await server.start();
 const client=connect(`http://localhost:${await listeningPort(server)}`,{transports:['websocket']});
 try{
  await new Promise<void>((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);});
  client.emit('control:input',{type:'FOLLOW'},'not-a-function');
  client.emit('control:command',{type:'RESET'},42);
  client.emit('control:advance',{},{});
  client.emit('session:join',{sessionId:'other'},'bad');
  const ack=await new Promise<Ack>(resolve=>client.emit('control:input',{type:'FOLLOW'},resolve));
  assert.equal(ack.error,'control_required');assert.equal(server.engine.getSnapshot().players.length,0);
 }finally{client.close();await server.stop();}
});
