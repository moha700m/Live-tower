# RISE 966 — Art direction

## North star
A hexagonal luminous spire — the Ascension Core — rising from a midnight Gulf plaza. A living teal energy column runs through mashrabiya-inspired lattice cladding. Helical architectural terraces carry climbers to a geometric crown lantern. The race is the hero; cyan route edges guide the eye upward. No official symbols, copied landmarks, palm clichés or flag wallpaper.

Full decision record: [VISUAL_REIMAGINATION.md](./VISUAL_REIMAGINATION.md).

## Scale and composition
World units: avatars ~0.8 tall, helix radius 2.58, tower height ~25. Perspective broadcast camera (fov 30) frames the entire spire at 9:16 with gentle leader bias. Leave ~12% top and ~15% bottom for stream-safe HUD.

## Materials and palette
Midnight #06101c, warm limestone #c4a07a, dark metal #1a2428, crown gold #e8c37a, oasis cyan #3ee6d4. Rough stone, brushed metal, restrained emissive trims. No photographic backgrounds. All scenery and players are real geometry.

## Avatars and animation
Original rounded toy figures, small torso, oval face, separate articulated arms and legs. Twelve appearances cover Gulf clothing, abaya-inspired silhouettes, casual, sport and futuristic outfits. Run uses alternating arms and legs; jumps bend limbs and arc vertically; winners wave from crown terrace. Keep names DOM-backed for Arabic shaping, emoji and bidi correctness.

## Modular worlds
Same iconic spire, different atmospheric envelope.

- Riyadh Night: deep skyline, cyan windows, warm stone, Gulf night light.
- Diriyah: terracotta, Najdi crenellations, lantern warmth.
- AlUla: sculptural rock stacks, amber seams, heat haze.
- Sky Oasis: floating gardens, clouds, high-altitude brightness.
- Future 966: dark luxury, gold / ivory / emerald, alloy rings.

## Asset naming
Environment: env_<world>_<module>. Avatar: chr_<style>_<variant>. All authored procedural geometry is original. GLB export tooling should preserve hierarchy and animations; no third-party character likenesses.

## Performance
30 active avatars maximum, bounded particle pools, shared materials, low-poly geometry, instancing for city/windows. Low DPR 1 without shadows, medium DPR 1.25, high DPR up to 1.75. Target 60fps; verify performance on actual stream hardware before claiming it.
