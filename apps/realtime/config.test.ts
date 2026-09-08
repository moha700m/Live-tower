import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.ts";

test("normalizes a trailing slash from the public web origin", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    PORT: "8787",
    WEB_ORIGIN: "https://live-tower.vercel.app/",
    SESSION_ID: "rise966",
    PROVIDER: "mock",
    CONTROL_TOKEN: "test-control-token",
  });

  assert.equal(config.WEB_ORIGIN, "https://live-tower.vercel.app");
});
