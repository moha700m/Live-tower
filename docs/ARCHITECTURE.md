# Architecture decisions

- React 19 / Fiber 9 / Drei 10 with a Vite static client. The game, not dashboard pages, owns most rendering code.
- Domain state advances using absolute timestamps. Render frames interpolate authoritative progress and animation; no browser physics authority is required for an automatic race.
- A single persistent Node replica owns one configured livestream session. Socket.IO sends full snapshots at 10Hz for simple recovery at this 30-avatar scale.
- Device-local demo persistence is explicitly separate from production PostgreSQL persistence. Demo tabs use Web Locks and BroadcastChannel; remote snapshots suspend local simulation.
- Server controls require a token in production. Raw viewer inputs can only be injected in mock mode. TikTok events pass through an isolated adapter.
- PostgreSQL stores a coherent snapshot and viewer aggregates in a transaction. One replica only; do not horizontally scale before implementing shared ownership.
- The GLB character pipeline is authored from original Three.js geometry. No raster backdrop substitutes for scene geometry.
- WebGL 2 is required. Browser automation with disabled GPU is insufficient for visual acceptance; CI includes rendering checks and screenshots on a software-capable Chromium worker.
