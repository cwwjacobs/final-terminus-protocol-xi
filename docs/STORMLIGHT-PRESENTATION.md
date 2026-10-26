# Stormlight presentation

26 October 2026. Presentation upgrade across Crown Resonance, the elevator, sentinel rush, giant Logos, collapse and escape. The combat kernel, damage, cooldowns, RNG and room authority are unchanged.

Editable direction and orbital crest: [Stormlight art board in Figma](https://www.figma.com/design/8SvJbL5Kaqkf3jmMyRCF3y?node-id=38-672). The board contains editable vectors and text, with no flattened screenshot of the game. It is an art-direction sketch, not a rendered 3D approval. `public/assets/vfx/stormlight-crest.svg` preserves the exact SVG imported as the Figma crest. Runtime environment/combat shaders are Three.js GLSL, not Figma shader-library assets.

## Appearance

- Procedural storm vault with slow cloud ribbons, atmospheric aether and cool horizon light. The lower arena shifts toward violet.
- Living obsidian floor inlays use subtle flowing veins and polar engravings. They are attached to the floor, so descent/collapse/escape retain their actual geometry transitions.
- Forked lightning has a white core and blue edge in crossed ribbons. Distant strikes are decorative; static arcs and lightning attacks use actual event recipients, including giant head/hand heights. Decorative lightning deals no damage.
- Cast sigils follow the actual hand. Shader accents enrich confirmed spells, weapon contacts, chains, bursts, healing and damage. Existing element-specific masks, atom splitting, fire rain and Zeus abilities remain active.
- All five painted heroes gain bone-bound pauldrons, bracers and gorgets, plus role-specific weapon or shield inlays. Bronze vines, lion/lightning, falcon feathers, violet crescents and pearl thread distinguish the roster. Imported GLBs, skeletons and motion remain intact.
- Positive resolved hits trigger original synthesized nonverbal pain cries for party members and enemies. They are vowel-formant synthesis, not recorded performances. Reactions are throttled to one per voice per 1.4 seconds; blocks, charge-only events, heals and burn ticks do not produce cries. Existing effects volume, mute and unlock rules apply.
- The title uses the Figma orbital crest and a darker stormlight palette. Target cards own enemy health/status to avoid a duplicate enemy list; camera labels name the selected enemy.

## Performance contracts

| Layer | High | Performance |
| --- | --- | --- |
| Environment | 3 geometry passes; 3 noise octaves; 160 motes | 3 geometry passes; 2 noise octaves; 64 motes |
| Environment textures / render targets | 0 / 0 | 0 / 0 |
| Mask/geometry transient particles | 72 | 34 |
| Procedural combat accents | 10 | 6 |
| Storm ribbon pool | 10 | 6 |
| New armor meshes | 6 per hero, 30 total | Same low-poly assets |
| Resolution ceiling | min(device ratio, 1.5) | min(device ratio, 1) |

The mask-plus-accent capacity is 82/40, below the previous 84/42 mask capacity. All pools allocate at creation and reuse their geometry. Particle texture swaps only request a new shader program when map presence changes. Armor meshes are merged by attachment with vertex colors, one material per hero, no textures/lights and no added shadow casters. One unshadowed directional storm fill supports the environment. There is no post-processing, screen-space bloom, reflection buffer, volumetric ray marching or new dependency.

After three consecutive combat samples below 44 FPS, resolution drops by 0.15, down to 0.85 (High) or 0.75 (Performance), respecting a lower device ceiling. Recovery requires twelve consecutive samples above 57 FPS and raises it by 0.1. Menus render at 30 Hz and are excluded from adaptation. Hidden tabs do no scene work. The canvas exposes `data-render-scale`; the existing HUD still reports FPS/draws/triangles. These are runtime controls, not a measured frame-rate guarantee.

Reduced motion freezes decorative shader drift, suppresses storm fill flashes, limits bolt brightness and removes accent expansion. Necessary attack warnings and confirmed contacts remain visible. Transient effects, pending contacts and audio are cleared on pause, visibility changes, reload/session replacement and teardown.

## Verification

`tests/cinematic-presentation.test.ts` checks shader-object lifecycle, collapse parenting, target/hand positions, finite lightning buffers, event-storm pool limits, reduced motion, adaptation hysteresis, pain-reaction semantics and disposal. `tests/hero-regalia.test.ts` loads the real shipped GLB skeletons, checks bone-bound moving bounds, the 30-mesh budget, isolated materials and disposal.

`node --experimental-strip-types scripts/verify-logos-encounters.mjs --full-game` completes Crown, descent, sentinels, giant, collapse and escape for all five controlled roles in trial and god modes (seed 123), with all five members alive. This is scripted active input, not a human balance study. Existing tests cover saves, rooms, controller mappings and the other abilities.

The live title, hero/solo setup, combat HUD, Crown results and transition to the sentinel fight were exercised in the cloud browser. It reports WebGL unavailable. The managed local preview refused connections after a stale development lock was repaired. Rendered 3D shaders, subjective audio mix, real GPU frame time, physical touch/controller and multi-device play remain unverified; no visual or performance approval is implied by source-level checks.
