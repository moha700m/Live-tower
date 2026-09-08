import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RULES, giftPoints, isJoinEvent, mergeRules } from "./index.ts";
import type { NormalizedEvent } from "../contracts/index.ts";

const base = (type: string, payload: Record<string, unknown> = {}): NormalizedEvent => ({
  eventId: type, platform: "mock", timestamp: 0, sessionId: "s", type, viewer: { providerUserId: "u" }, payload,
});

test("default gift mapping is rose 1, gift 3, rocket 8", () => {
  assert.equal(giftPoints({ giftName: "rose" }), 1);
  assert.equal(giftPoints({ giftName: "rocket" }), 8);
  assert.equal(giftPoints({ giftName: "mystery" }), 3);
});

test("join rules include follow, viewer join, and Arabic ادخل comments", () => {
  assert.equal(isJoinEvent(base("FOLLOW")), true);
  assert.equal(isJoinEvent(base("VIEWER_JOIN")), true);
  assert.equal(isJoinEvent(base("COMMENT", { text: "ادخل" })), true);
  assert.equal(isJoinEvent(base("COMMENT", { text: "hello" })), false);
});

test("nested rule configuration is isolated from defaults", () => {
  const rules = mergeRules({ rules: { giftProgress: { rose: 4 }, routeSegments: 60 } });
  assert.equal(rules.giftProgress.rose, 4);
  assert.equal(rules.giftProgress.rocket, DEFAULT_RULES.giftProgress.rocket);
  assert.equal(DEFAULT_RULES.giftProgress.rose, 1);
  rules.join.commentKeywords.push("mutated");
  assert.equal(DEFAULT_RULES.join.commentKeywords.includes("mutated"), false);
});

