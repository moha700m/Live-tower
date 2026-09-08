# LIVE TOWER — Visual Reimagination

Branch: `grok-visual-rebuild`  
Baseline: `continue-astra` @ `9919259331fc5c29af1fd74230cd7b7154f289ea`  
`main` is not modified.

## Problems with the previous design

The known-good Astra scene was technically complete but visually a prototype:

- Orthographic debug framing, almost no broadcast camera.
- The tower was four posts + torus rings + a thin sandstone ribbon.
- Worlds were palette swaps with a handful of extra props.
- Palms and generic boxes read as cliché, not as a Saudi-born global identity.
- Empty space around the tower — not a world.
- Default-looking materials, even lighting, weak silhouette.
- HUD was functional but not a live-competition broadcast.

## Visual strategy

Treat the tower as a **branded architectural icon**, then wrap it in five atmospheric worlds. Gameplay progress (0→1 helix) stays; the representation becomes a monumental spire.

Livestream-first: 1080×1920, readable in 2–3 seconds, safe HUD bands, characters never lost in the environment.

## Four directions explored

| Direction | Idea | Verdict |
|---|---|---|
| A. Sandstone Ribbon Oasis | Refine the current coiled path and oasis city | Too close to the prototype. Weak silhouette. |
| B. Orbital Ring Arena | Floating rings around an energy core | Beautiful, but loses “tower” readability on a phone. |
| C. Stacked District Megacity | Four city layers stacked as the climb | Busy, expensive, hard to parse during a live overlay. |
| D. **Ascension Core — Luminous Spire** | Hexagonal megastructure, living teal core, helical terraces, mashrabiya lattice, crown lantern | **Selected.** |

### Why D won

1. TikTok readability — one vertical silhouette, obvious objective.
2. Original — not Fall Guys, not Tower of Hell, not a landmark copy.
3. Saudi identity without cliché — lattice geometry, limestone + metal, Gulf night light, 966 as a lantern not a sticker.
4. Premium materials and lighting instead of palette swaps.
5. Mobile budget — procedural geometry, instancing, quality tiers.
6. Spectator drama — core pulse, path energy, crown beacon.
7. Brandable — a screenshot is the logo.
8. Feasible in the existing R3F client.
9. Replay — five atmospheres around one DNA.
10. Future worlds can reuse the spire and swap the envelope.

## World design system

Same spire. Different envelope, light, and ground language.

| # | World | Envelope |
|---|---|---|
| 01 | Riyadh Night | Futuristic night city, cyan path, warm stone, deep skyline |
| 02 | Diriyah | Najdi monumental geometry, terracotta, lantern warmth |
| 03 | AlUla | Canyon-tech monoliths, amber seams, heat haze |
| 04 | Sky Oasis | High-altitude citadel, clouds, brighter tension |
| 05 | Future 966 | Dark luxury, gold / ivory / emerald, royal alloy |

## Tower design

- **Base** — stepped hexagonal plinth and plaza rings.
- **Midsection** — hex shaft, lattice cladding, vertical fins, storey rings.
- **Final ascent** — taper, denser light, helical terraces tighten.
- **Crown** — geometric lantern + gold beacon. Reaching it reads as “I WON.”
- **Core** — teal (world-tinted) energy column visible through the shaft.

Players climb a 2.3-turn architectural helix. Inner/outer luminous rails. Checkpoint arches ignite as the leader passes.

## Character strategy

Keep the original `chr-rise966.glb` toy-hero language (readable at livestream scale). Improve presentation: world-tinted lighting, boost rings, winner crown, DOM nameplates for Arabic.

## Material strategy

Dark architectural metal, warm limestone, smoked openings, luminous energy strips, restrained gold, controlled emerald. Roughness/metalness used on purpose. No default Three.js plastic, no full-scene bloom.

## Lighting strategy

Key / fill / rim per world. Core and crown as practical lights. Characters stay readable. Final Rush raises core intensity. Podium holds on the lantern.

## HUD strategy

Premium live-competition chrome. Existing test selectors preserved (`game-stage`, `world-label`, `king-banner`, `data-viewer`, round timer). Safe areas for TikTok overlays. RTL designed, not mirrored.

## Camera strategy

Perspective broadcast rig. Full tower readable. Soft leader bias. Establishing shot on countdown, tighter on Final Rush, crown hold on podium. No orbit spam, no shake.

## Mobile / performance

Quality tiers: low DPR 1 no shadows, medium 1.25, high 1.75. Instanced city/rocks/clouds. Shared materials. Bounded particles. 30 avatars max. `prefers-reduced-motion` kills camera drift.

## What was not touched

`apps/realtime`, `packages/game-core`, `packages/rules-engine`, TikTok provider, Socket.IO contracts, Render blueprint, production URLs, `main`, `continue-astra`.
