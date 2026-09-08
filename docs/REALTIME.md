# Realtime server

`apps/realtime/server.ts` is the single authoritative Node process for the rise966 game. It owns one game-core engine, accepts normalized public LIVE events through a provider adapter, persists snapshots when Postgres is configured, and broadcasts `snapshot`, `action`, and `provider` messages over Socket.IO.

## Local run

```bash
cp .env.example .env
npm run server
```

The local default is `PROVIDER=mock`, which has no external account dependency. The HTTP health endpoint is `GET /health`; the optional durable leaderboard endpoint is `GET /api/leaderboard`. The Socket.IO endpoint is the same origin and uses the exact `WEB_ORIGIN` value for CORS.

A control client connects with `auth: { role: "control", token: CONTROL_TOKEN }` and may send `control:input` (mock events) or `control:command` (`FINAL_RUSH`, `RESET`, `PAUSE`, `RESUME`, `WORLD`, and `RULES`). `control:advance` is available only in local/test mode. Control input is accepted only in mock mode. A real provider is read-only by design, while authenticated phase commands remain available. When `OVERLAY_TOKEN` is set, read-only and overlay sockets also send `auth: { token: OVERLAY_TOKEN }`.

Example mock input:

```js
socket.emit("control:input", {
  type: "GIFT",
  viewer: { providerUserId: "u1", username: "u1", nickname: "Viewer One" },
  payload: { giftId: "rose", giftName: "Rose", repeatCount: 1 }
});
```

## TikTok provider

Set `PROVIDER=tiktok` and `TIKTOK_UNIQUE_ID` to observe a public stream. The adapter uses `tiktok-live-connector` with anonymous options only; it does not accept or forward passwords, cookies, session IDs, OAuth tokens, or chat-send capabilities. Connector events are normalized to `VIEWER_JOIN`, `COMMENT`, `LIKE`, `FOLLOW`, `SHARE`, `VIEWER_COUNT`, and `GIFT`. Streakable gift messages are held until their final `repeatEnd` event so intermediate increments are not counted twice. Connection state is reported truthfully as connecting, connected, reconnecting, or disconnected.

## Postgres durability

Set `DATABASE_URL` to enable `realtime_snapshots` and `viewer_progress`. The server initializes the same schema on startup; the reference migration is [`apps/realtime/migrations/001_realtime.sql`](../apps/realtime/migrations/001_realtime.sql). Without a database, the server logs that it is ephemeral and state is lost on restart. Use a single persistent Node instance for this authoritative session; horizontal replicas would require an external event log/leader election and are intentionally outside this design.

## Deployment

`render.yaml` provisions one persistent web service and a Postgres instance. Its release configuration now selects `PROVIDER=tiktok`; Render will ask for `TIKTOK_UNIQUE_ID`, `WEB_ORIGIN`, `CONTROL_TOKEN`, and (if used) `OVERLAY_TOKEN` when you create the Blueprint. Enter the public TikTok username without `@`. The connector is anonymous and read-only: it does not accept a TikTok password, cookie, session ID, or OAuth token. If you need to rehearse without a live account, set `PROVIDER=mock` manually before deploying. Render supplies `PORT`; the server listens on all interfaces and exposes `/health` for the platform check.
