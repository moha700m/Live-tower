import assert from "node:assert/strict";
import test from "node:test";
import { createEngine, stableViewerId } from "./index.ts";
import type { NormalizedEvent } from "../contracts/index.ts";

const event = (eventId: string, type: string, user = "u1", payload: Record<string, unknown> = {}, timestamp = 0): NormalizedEvent => ({
  eventId, type, timestamp, platform: "mock", sessionId: "test", viewer: { providerUserId: user, username: user }, payload,
});

test("starts a countdown from a join and enters active at an absolute boundary", () => {
  const engine = createEngine({ nowMs: 1_000 });
  const joined = engine.dispatch(event("join", "VIEWER_JOIN", "one"), 1_000);
  assert.equal(joined.phase, "COUNTDOWN");
  assert.equal(joined.phaseEndsAt, 11_000);
  assert.equal(engine.advance(11_000).phase, "ACTIVE");
  assert.equal(engine.getSnapshot().phaseEndsAt, 161_000);
});

test("deduplicates event IDs and getSnapshot is safe to mutate", () => {
  const engine = createEngine({ nowMs: 0 });
  engine.dispatch(event("same", "FOLLOW", "one"), 0);
  const duplicate = engine.dispatch(event("same", "FOLLOW", "one"), 1);
  assert.equal(duplicate.progress[stableViewerId("mock", "one")]?.xp, 2);
  const copy = engine.getSnapshot();
  copy.players[0]!.name = "changed";
  copy.progress[stableViewerId("mock", "one")]!.xp = 999;
  assert.equal(engine.getSnapshot().players[0]!.name, "one");
  assert.equal(engine.getSnapshot().progress[stableViewerId("mock", "one")]?.xp, 2);
});

test("rose, gift and rocket use the configured route mapping", () => {
  const engine = createEngine({ nowMs: 0, config: { raceMs: 1_000, finalRushMs: 200 } });
  engine.dispatch(event("join", "FOLLOW", "one"), 0);
  engine.advance(10_000);
  engine.dispatch(event("rose", "GIFT", "one", { giftName: "rose" }), 10_001);
  engine.dispatch(event("gift", "GIFT", "one", { giftName: "gift" }), 10_002);
  const snapshot = engine.dispatch(event("rocket", "GIFT", "one", { giftName: "rocket" }), 10_003);
  const player = snapshot.players[0]!;
  assert.equal(snapshot.progress[player.id]!.giftPoints, 12);
  assert.ok(player.progress >= 12 / 48);
  assert.ok(player.boostUntil! >= 18_003);
});

test("full or late rounds queue viewers FIFO and carry them into the next round", () => {
  const engine = createEngine({ nowMs: 0, config: { maxPlayers: 1 } });
  engine.dispatch(event("one", "FOLLOW", "one"), 0);
  engine.dispatch(event("two", "FOLLOW", "two"), 1);
  assert.deepEqual(engine.getSnapshot().queue.map((item) => item.id), ["mock:two"]);
  engine.advance(203_000);
  const next = engine.getSnapshot();
  assert.equal(next.round, 2);
  assert.equal(next.players[0]?.id, "mock:two");
});

test("phase transitions are automatic across podium and transition", () => {
  const engine = createEngine({ nowMs: 0, config: { raceMs: 180_000, finalRushMs: 30_000, podiumMs: 10_000, transitionMs: 3_000 } });
  engine.dispatch(event("join", "FOLLOW", "one"), 0);
  assert.equal(engine.advance(160_000).phase, "FINAL_RUSH");
  assert.equal(engine.advance(190_000).phase, "PODIUM");
  assert.equal(engine.advance(200_000).phase, "TRANSITION");
  assert.equal(engine.advance(203_000).phase, "COUNTDOWN");
  assert.equal(engine.getSnapshot().round, 2);
});

test("only the first finisher receives the crown while all climbers finish", () => {
  const engine = createEngine({ nowMs: 0, config: { raceMs: 180_000, finalRushMs: 30_000 } });
  engine.dispatch(event("a", "FOLLOW", "a"), 0);
  engine.dispatch(event("b", "FOLLOW", "b"), 1);
  engine.advance(10_000);
  engine.dispatch(event("rocket", "GIFT", "a", { giftName: "rocket", quantity: 6 }), 10_001);
  engine.advance(190_000);
  const state = engine.getSnapshot();
  assert.equal(state.players.filter((player) => player.finishOrder === 1).length, 1);
  const crowns = Object.values(state.progress).map((stats) => stats.crowns);
  assert.equal(crowns.filter((value) => value === 1).length, 1);
  assert.equal(crowns.reduce((sum, value) => sum + value, 0), 1);
});

test("Arabic comment join and progress stats survive persistence restoration", () => {
  const first = createEngine({ nowMs: 0 });
  first.dispatch(event("ar", "COMMENT", "arab", { text: "ادخل" }), 0);
  const restored = createEngine({ nowMs: 100, initialState: first.getSnapshot() });
  assert.equal(restored.getSnapshot().players[0]?.id, "mock:arab");
  assert.equal(restored.getSnapshot().progress["mock:arab"]?.participations, 1);
  assert.equal(restored.getSnapshot().revision, first.getSnapshot().revision);
});

test("trusted controls provide final rush, world, reset, pause and resume", () => {
  const engine = createEngine({ nowMs: 0 });
  engine.dispatch(event("join", "FOLLOW", "one"), 0);
  engine.advance(10_000);
  assert.equal(engine.control({ type: "FINAL_RUSH" }, 10_000).phase, "FINAL_RUSH");
  assert.equal(engine.control({ type: "WORLD", worldIndex: 4 }).worldIndex, 4);
  engine.control({ type: "PAUSE" }, 10_001);
  const paused = engine.advance(100_000);
  assert.equal(paused.serverNow, 10_001);
  engine.control({ type: "RESUME" }, 10_001);
  assert.equal(engine.control({ type: "RESET" }, 10_002).phase, "COUNTDOWN");
});

test('gift advantage remains capped across expiry and restoration, resets per round',()=>{
 const engine=createEngine({nowMs:0});engine.dispatch(event('join','FOLLOW'),0);engine.advance(10000);
 for(let i=0;i<10;i++)engine.dispatch(event(`gift${i}`,'GIFT','u1',{giftName:'rocket',quantity:100}),10000);
 assert.ok(engine.getSnapshot().players[0]!.progress<=0.350001);
 const restored=createEngine({nowMs:20000,initialState:engine.getSnapshot()});
 const before=restored.getSnapshot().players[0]!.progress;
 restored.dispatch(event('more','GIFT','u1',{giftName:'rocket',quantity:100}),20000);
 assert.equal(restored.getSnapshot().players[0]!.progress,before);
 restored.advance(213000);
 const next=restored.getSnapshot().players[0]!.progress;
 restored.dispatch(event('new-round','GIFT','u1',{giftName:'rose'}),213000);
 assert.ok(restored.getSnapshot().players[0]!.progress>next);
});

test('large ticks and small ticks produce the same boost and weather progress',()=>{
 const a=createEngine({nowMs:0});a.dispatch(event('join','FOLLOW'),0);a.advance(10000);
 a.dispatch(event('gift','GIFT','u1',{giftName:'rose'}),10000);
 a.control({type:'EVENT',value:'SANDSTORM'},10000);
 const b=createEngine({nowMs:10000,initialState:a.getSnapshot()});
 a.advance(70000);for(let t=10100;t<=70000;t+=100)b.advance(t);
 assert.ok(Math.abs(a.getSnapshot().players[0]!.progress-b.getSnapshot().players[0]!.progress)<1e-9);
});

test('late join is queued even when an active slot remains',()=>{
 const engine=createEngine({nowMs:0});engine.dispatch(event('first','FOLLOW'),0);engine.advance(180000);
 const state=engine.dispatch(event('late','FOLLOW','محمد'),180000);
 assert.equal(state.players.length,1);assert.equal(state.queue[0]?.name,'محمد');
 assert.equal(engine.advance(203000).players.some(p=>p.name==='محمد'),true);
});

test('restored pause shifts all deadlines without moving a challenger',()=>{
 const engine=createEngine({nowMs:0});engine.dispatch(event('first','FOLLOW'),0);engine.advance(20000);
 engine.dispatch(event('rose','GIFT','u1',{giftName:'rose'}),20000);engine.control({type:'PAUSE'},21000);
 const frozen=engine.getSnapshot();const restored=createEngine({nowMs:90000,initialState:frozen});
 assert.equal(restored.getSnapshot().players[0]!.progress,frozen.players[0]!.progress);
 restored.control({type:'RESUME'},90000);
 assert.equal(restored.getSnapshot().phaseEndsAt,frozen.phaseEndsAt!+69000);
 assert.equal(restored.getSnapshot().players[0]!.boostUntil,frozen.players[0]!.boostUntil!+69000);
 restored.dispatch(event('rose','GIFT','u1',{giftName:'rose'}),90000);
 assert.equal(restored.getSnapshot().progress['mock:u1']!.giftPoints,1);
});
