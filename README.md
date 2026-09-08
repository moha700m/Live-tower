# LIVE TOWER — RISE 966

**جمهورك ما يشاهد فقط. جمهورك يصعد.**

An original Saudi-inspired 3D livestream tower race. Follow → enter. Gifts → boost. Summit → crown. Rounds repeat automatically.

## Run

Node.js 24 is recommended.

```bash
npm ci
npm run dev
```

Open `http://localhost:4173/demo`. Enter **محمد**, press **Follow**, then try **Rose** and **Rocket**. The demo requires no TikTok account and never sends real gifts or charges money. Six clearly simulated challengers populate a fresh demo. Local demo progress is saved in the browser; tabs on the same origin share one session using Web Locks and BroadcastChannel.

WebGL 2 and browser hardware acceleration are required for the 3D scene. Unsupported browsers display an honest capability message while retaining game controls.

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page with the actual running 3D scene |
| `/demo` | Interactive simulated livestream |
| `/play` | Clean 9:16 LIVE Studio capture |
| `/dashboard` | Session controls |
| `/dashboard/live` | Active session |
| `/dashboard/rules` | Gift/action mappings |
| `/dashboard/leaderboard` | XP and crown rankings |
| `/dashboard/customize` | Five worlds and quality settings |
| `/overlay/:sessionId` | Capture route for the configured single server session |

## Architecture

```text
apps/web        React + Vite + Three.js + R3F + Drei
apps/realtime   Persistent Node Socket.IO service + isolated providers
packages/contracts    Shared serializable domain types
packages/game-core    Absolute-time round state machine
packages/rules-engine Configurable normalized interaction rules
```

One package manager and lockfile keep the small monorepo simple. Rendering does not consume raw TikTok payloads. The local engine and server use the same game logic.

Rounds use a 10-second countdown, 180-second race (last 30 seconds Final Rush), 10-second podium and 3-second world transition. At most 30 active avatars are rendered. Late arrivals and overflow queue for a following round. The first finisher stays on the crown terrace; other racers continue.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests require `npx playwright install chromium`. GitHub Actions installs Chromium, runs the checks and exports desktop, 390px mobile, five-world and 1080×1920 capture screenshots. A passing unit test is not a GPU performance benchmark.

## Deploy

The web build is static and deploys to Vercel using `vercel.json`. Import this repository, keep the root directory as the repository root, and use the Vite preset. The production build output is `dist`.

The persistent service must run separately on Render/Railway/Fly or a Node host. It **must not** run in Vercel request-scoped serverless functions. See [realtime deployment](docs/REALTIME.md), [LIVE Studio setup](docs/TIKTOK_LIVE_STUDIO.md) and `.env.example`.

The default web release is a mock demo. A live deployment needs a persistent Node host, PostgreSQL for durable progression, explicit origin and token configuration, a broadcaster username and a real stream integration test. A public URL alone does not prove TikTok connectivity.

## Art and rights

[Art direction](docs/ART_DIRECTION.md) describes the original modular world and character language. No Roblox assets, official Saudi emblems, protected landmark replicas or commercial music are included. UI audio is synthesized with Web Audio. Review third-party package licenses before redistributing this product; the isolated unofficial TikTok connector declares AGPL-3.0 and is not an official TikTok API.
