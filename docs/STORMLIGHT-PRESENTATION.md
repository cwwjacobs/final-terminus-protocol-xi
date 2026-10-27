# Stormlight presentation

27 October 2026 revision. Presentation upgrade across Crown Resonance, the elevator, sentinel rush, giant Logos, collapse and escape. Damage, cooldowns, RNG and room authority are unchanged; the descent now accepts an authoritative unanimous ready-up skip.

Editable direction and orbital crest: [Stormlight art board in Figma](https://www.figma.com/design/8SvJbL5Kaqkf3jmMyRCF3y?node-id=38-672). The board contains editable vectors and text, with no flattened screenshot of the game. It is an art-direction sketch, not a rendered 3D approval. `public/assets/vfx/stormlight-crest.svg` preserves the exact SVG imported as the Figma crest. Runtime environment/combat shaders are Three.js GLSL, not Figma shader-library assets.

## Appearance

- Almost-black open void with sparse, faint interference contours. Decorative spires, orbital gates, floating stone shards, star dome and motes have been removed. Neutral rim lighting preserves character and telegraph readability.
- Living obsidian floor inlays use subtle flowing veins and polar engravings. They are attached to the floor, so descent/collapse/escape retain their actual geometry transitions.
- Forked lightning has a white core and blue edge in crossed ribbons. Distant strikes are decorative; static arcs and lightning attacks use actual event recipients, including giant head/hand heights. Decorative lightning deals no damage.
- Cast sigils follow the actual hand. Shader accents enrich confirmed spells, weapon contacts, chains, bursts, healing and damage. Existing element-specific masks, atom splitting, fire rain and Zeus abilities remain active.
- The five painted heroes use fitted, skinned Greek garments with pleated lower wraps, shoulder drapes, shallow forearm plates and role-specific weapon inlays. The outfits share each original body skeleton. Son of Zeus uses white folded drapery, gold trim, silver hair and a beard over the actual animated anatomy; it no longer replaces Heracles with a sphere-and-cone figure.
- Positive resolved hits trigger original synthesized nonverbal pain cries for party members and enemies. They are vowel-formant synthesis, not recorded performances. Reactions are throttled to one per voice per 1.4 seconds; blocks, charge-only events, heals and burn ticks do not produce cries. Existing effects volume, mute and unlock rules apply.
- The title preserves the supplied Zeus/Logos artwork and the external Q Protocol menu. Target cards own enemy health/status to avoid a duplicate enemy list; camera labels name the selected enemy.

## Performance contracts

| Layer | High | Performance |
| --- | --- | --- |
| Environment | 2 geometry passes; 3 noise octaves; no motes | 2 geometry passes; 2 noise octaves; no motes |
| Environment textures / render targets | 0 / 0 | 0 / 0 |
| Mask/geometry transient particles | 72 | 34 |
| Procedural combat accents | 10 | 6 |
| Storm ribbon pool | 10 | 6 |
| Normal wardrobe | 6 meshes per hero, 30 total | Same low-poly assets |
| Son of Zeus | 8 meshes including exposed anatomy; normal wardrobe hidden | Same assets |
| Resolution ceiling | min(device ratio, 1.5) | min(device ratio, 1) |

The mask-plus-accent capacity is 82/40, below the previous 84/42 mask capacity. All pools allocate at creation and reuse their geometry. Particle texture swaps only request a new shader program when map presence changes. Wardrobe parts use vertex colors and one material per hero, borrow the original skeleton, and add no textures, lights or shadow casters. One unshadowed directional storm fill supports the environment. There is no post-processing, screen-space bloom, reflection buffer, volumetric ray marching or new dependency.

After three consecutive combat samples below 44 FPS, resolution drops by 0.15, down to 0.85 (High) or 0.75 (Performance), respecting a lower device ceiling. Recovery requires twelve consecutive samples above 57 FPS and raises it by 0.1. Menus render at 30 Hz and are excluded from adaptation. Hidden tabs do no scene work. The canvas exposes `data-render-scale`; the existing HUD still reports FPS/draws/triangles. These are runtime controls, not a measured frame-rate guarantee.

Reduced motion freezes decorative shader drift, suppresses storm fill flashes, limits bolt brightness and removes accent expansion. Necessary attack warnings and confirmed contacts remain visible. Transient effects, pending contacts and audio are cleared on pause, visibility changes, reload/session replacement and teardown.

## Verification

`tests/cinematic-presentation.test.ts` checks shader-object lifecycle, collapse parenting, target/hand positions, finite lightning buffers, event-storm pool limits, reduced motion, adaptation hysteresis, pain-reaction semantics and disposal. `tests/hero-regalia.test.ts` and `tests/hero-divinity.test.ts` load the real shipped GLB skeletons and check moving bounds, normalized weights, bounded draw counts, isolated materials and disposal.

`node --experimental-strip-types scripts/verify-logos-encounters.mjs --full-game` (also with `--ready-up`) completes Crown, descent, sentinels, giant, collapse and escape for all five controlled roles in trial and god modes (seed 123), with all five members alive. This is scripted active input, not a human balance study. Existing tests cover saves, rooms, controller mappings and the other abilities.

The managed local preview serves the title, external menu, hero/solo setup and loading menu after its execution profile was repaired. The cloud browser reports WebGL unavailable. Actual posed triangle exports are used to review outfit fit and boss silhouettes. Rendered 3D shaders, subjective audio mix, real GPU frame time, physical touch/controller and multi-device play remain unverified; no visual or performance approval is implied by source-level checks.
