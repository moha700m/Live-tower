# LIVE TOWER — Production Cutover

This runbook continues the Astra baseline without changing `main` until the live path is verified.

## 1. Realtime service first — mock mode

Deploy `continue-astra` as one persistent Node service plus one PostgreSQL database. `render.yaml` is the reference Blueprint and uses Frankfurt for lower latency to Saudi Arabia than the previous Oregon default.

Required production variables:

- `NODE_ENV=production`
- `PROVIDER=mock`
- `SESSION_ID=rise966`
- `WEB_ORIGIN=https://<frontend-host>`
- `CONTROL_TOKEN=<strong random secret>`
- `OVERLAY_TOKEN=<separate strong random secret>`
- `DATABASE_URL=<postgres connection string>`

Do not enable TikTok yet.

Acceptance gate:

- `GET /health` returns HTTP 200.
- `provider` is `mock`.
- `database` is `connected`.
- invalid control/overlay tokens are rejected.
- a valid control socket can change world/reset/pause/resume.
- a valid overlay/read-only socket receives snapshots but cannot issue control commands.

## 2. Connect the web build

Build the web frontend with:

- `VITE_GAME_SERVER_URL=https://<realtime-host>`

Keep `CONTROL_TOKEN` out of the web build. The dashboard operator supplies the control token at runtime. If `OVERLAY_TOKEN` is enabled, `/play` and `/overlay/:sessionId` receive it only through the local URL fragment `#token=...`; do not publish or share that URL.

Acceptance gate:

- `/demo` still works locally without the server.
- `/play` reads the remote authoritative snapshot.
- dashboard control connects with the control token.
- reconnecting the realtime service recovers without a page crash.
- 1080x1920 capture remains correct.

## 3. TikTok test LIVE

Only after mock production is green:

- set `TIKTOK_UNIQUE_ID` to the broadcaster username.
- change `PROVIDER=tiktok`.
- restart the realtime service.

Acceptance gate on a real test LIVE:

- provider status becomes `connected`.
- follow creates/queues the correct viewer.
- likes and shares normalize once.
- gifts normalize once, including streak gifts only after their final repeat event.
- no password, cookie, session token, chat sending, gifting, or account automation is used.

If TikTok fails, switch `PROVIDER` back to `mock`; do not modify game-core or the 3D renderer to compensate for provider connectivity.

## 4. Soak test before merge

Run at least one complete broadcast rehearsal through multiple automatic rounds and verify:

- no duplicate participants from repeated provider events.
- no runaway memory growth or Socket.IO reconnect loop.
- PostgreSQL state survives a realtime service restart.
- `/play` stays smooth at the selected quality level.
- mobile dashboard and 1080x1920 capture stay visually correct.

Only after these gates pass should `continue-astra` be merged to `main`.
