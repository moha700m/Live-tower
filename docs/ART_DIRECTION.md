# RISE 966 — Art direction

## North star
A luminous vertical oasis suspended above a midnight Saudi-inspired city. A sandstone ribbon coils around an open geometric tower, ending in a radiant crown terrace. The race is the hero; cyan route edges guide the eye upward. No official symbols or copied landmarks.

## Scale and composition
World units: avatars 0.8 tall, route width 1.5, tower radius 3, height 24. Orthographic three-quarter camera frames the entire tower at 9:16 with gentle leader tracking. Leave 12% top and 15% bottom for stream-safe HUD.

## Materials and palette
Midnight #071421, warm stone #b78b59, chalk #f1ddb0, crown gold #ffc86b, oasis cyan #5df2df. Rough stone, satin ceramic avatars, restrained emissive trims. No photographic backgrounds. All scenery and players are real geometry.

## Avatars and animation
Original rounded toy figures, small torso, oval face, separate articulated arms and legs. Twelve appearances cover Gulf clothing, abaya-inspired silhouettes, casual, sport and futuristic outfits. Run uses alternating arms and legs; jumps bend limbs and arc vertically; winners wave from crown terrace. Keep names DOM-backed for Arabic shaping, emoji and bidi correctness.

## Modular worlds
Riyadh Night: dark city and cyan windows. Diriyah: warm terracotta, arches, triangular crenellations. AlUla: sculptural rock stacks, amber dust. Sky Oasis: floating gardens and clouds. Future 966: violet alloy and luminous cyan gateways. Interpret architecture originally.

## Asset naming
Environment: env_<world>_<module>. Avatar: chr_<style>_<variant>. All authored procedural geometry is original. GLB export tooling should preserve hierarchy and animations; no third-party character likenesses.

## Performance
30 active avatars maximum, bounded particle pools, shared simple materials, low-poly geometry, instancing repeated city elements where useful. Low DPR 1 without shadows, medium DPR 1.25, high DPR up to 1.75. Target 60fps; verify performance on actual stream hardware before claiming it.
