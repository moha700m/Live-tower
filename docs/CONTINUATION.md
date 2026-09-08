# LIVE TOWER — Continuation Safety Notes

This branch continues from Astra's known-good baseline commit `1ca93aaf7d13c7ca83d291796d924bc0a8011236`.

## Guardrails

- `main` remains the protected baseline until continuation CI and review pass.
- All continuation changes land on `continue-astra` first.
- Every application change must pass lint, typecheck, unit tests, build, and Playwright E2E before merge.
- Do not replace the existing game architecture unless a measured defect requires it.
- Preserve the existing Three.js/R3F rendering, game-core state machine, realtime provider boundary, and mock demo while production TikTok integration is completed.
- Production TikTok remains read-only: no passwords, cookies, session secrets, chat sending, gifting, or account automation.

## Current verified architecture

- `apps/web`: React + Vite + Three.js / React Three Fiber.
- `apps/realtime`: persistent Node + Socket.IO authoritative session.
- `packages/game-core`: round and progression engine.
- `packages/rules-engine`: normalized interaction rules.
- PostgreSQL is optional locally and required for durable production progression.
- Vercel hosts the static web build; the persistent realtime process belongs on a long-running Node host.

## Continuation order

1. Preserve and strengthen the known-good QA baseline.
2. Verify all five 3D worlds finish loading before screenshots/assertions.
3. Deploy the persistent realtime service in mock mode and verify `/health`, Socket.IO, dashboard control, `/play`, and overlay paths end-to-end.
4. Connect the web build through `VITE_GAME_SERVER_URL` and verify reconnect behavior.
5. Enable the TikTok provider only after a broadcaster username is configured; verify real follow/like/share/gift normalization on a test LIVE.
6. Perform 1080x1920 LIVE Studio soak testing, mobile/dashboard regression testing, and performance tuning before merging to `main`.
