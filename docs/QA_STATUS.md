# Release verification — 8 September 2026

## Verified

- Local lint, strict TypeScript, production build and 20 domain/Socket.IO tests pass.
- Chromium CI run [34238593357](https://github.com/moha700m/Live-tower/actions/runs/34238593357) passed real WebGL rendering, Arabic Follow → avatar, climb progress, Rose, Rocket, crown, podium, automatic next round, five worlds, mobile layout and exact 1080×1920 capture bounds.
- The screenshot artifacts revealed an overly dark tower and undersized name labels. The follow-up changes increase fill lighting and remove inappropriate perspective scaling from orthographic name labels.
- Gift streak normalization is tested against the installed connector's nested `gift.type` / `gift.name` shape. Intermediate cumulative packets are ignored.
- Gift movement advantage is limited to 35% of a route per round, including temporary speed bonus. The budget survives saves and refreshes, and resets on the next race.
- Restoration, paused deadlines, duplicate events, late arrivals with free slots, and coarse versus fine time integration have regression coverage.

## Not yet verified / release limits

- A production deployment is blocked by Vercel permissions (403 for production and preview). Sites creation is blocked by its hosting usage limit. No working public deployment URL is claimed.
- The persistent Node service and PostgreSQL schema exist but have not been provisioned on a production host. No real broadcaster stream has been connected or validated.
- The unofficial TikTok adapter can break when upstream protocols change; mocked packet tests are not a live integration test.
- GPU frame-rate targets and multi-hour soak testing are not yet certified. CI uses software WebGL and is a functional check, not a hardware benchmark.
- Avatars use original GLB node animations (idle/run/jump/celebrate), not a skinned skeleton. The obstacle route is an automated simulation, not rigid-body player physics.
- The initial wardrobe uses 12 palettes on a shared original model; a complete culturally varied wardrobe and additional power-up behaviors remain future art/gameplay work.
- Persistence batches snapshots approximately once per second. A process crash can lose the most recent batch; this is not an exactly-once financial ledger.

## Hosting action

Grant the connected Vercel account deployment access to a LIVE TOWER project, or import `moha700m/Live-tower` in an authorized Vercel account using the Vite preset, repository root, `npm run build`, and `dist`. Do not reuse LIVE MARKET. Follow `REALTIME.md` separately for the persistent service.
