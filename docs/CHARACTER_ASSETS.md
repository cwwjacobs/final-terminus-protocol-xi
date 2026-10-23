# Painted character assets

The game uses the five painted models from Corey's local `3DHEROS` collection. Ariadne uses **v3**. The selected files were copied into this checkout; source content hashes and modification times remained unchanged. Raw generated shapes, stone variants, harness bodies and archived Blender trials are not shipped as the roster.

## Files and provenance

| Hero ID | Source within `3DHEROS` | Shipped file under `public/assets/models/` | Bytes | Triangles |
| --- | --- | --- | ---: | ---: |
| bacchus | `heroes/bacchus.glb` | `bacchus.glb` | 4,147,236 | 25,000 |
| heracles | `heroes/heracles.glb` | `heracles.glb` | 4,174,492 | 25,000 |
| dolos | `heroes/dolos.glb` | `dolos.glb` | 3,892,696 | 25,000 |
| hecate | `heroes/hecate.glb` | `hecate.glb` | 4,625,976 | 25,000 |
| ariadne | `ariadne/ariadne_v3.glb` | `ariadne.glb` | 4,364,444 | 24,998 |
| **Total** | | | **21,204,844** | **124,998** |

`public/assets/models/manifest.json` records the revision, filenames, exact byte sizes and SHA-256 hashes. It contains no private absolute source paths. The runtime URL mapping is `HERO_ASSET_MANIFEST` in `components/game/hero-assets.ts`; the JSON manifest is the copy/integrity receipt, not the runtime loader configuration.

The collection's notes identify these as its finished painted exports and describe Hunyuan-generated shapes, painting and a fitted game skeleton. Those are source provenance statements; this integration does not independently verify upstream generation or license terms, and it does not certify close-up art as complete. Existing game screenshots in that collection concern a different Terminus Quantum checkout.

All five GLBs are self-contained. Each has one mesh/primitive, one double-sided PBR material, three embedded 2048×2048 JPEG textures (base color, normal, metallic/roughness), and a 22-joint skeleton with underscore names. They preserve natural metre scale, +Y up and +Z forward, with bind geometry within 0.6 mm of Y=0. They contain `idle` (2 seconds) and `walk` (1 second); no weapon props or authored attack, cast, hit or death clips are included.

## Runtime boundary

Painted heroes are the default. **Settings → Characters** can switch to **Original scaffold**; that preference is saved locally. A scaffold appears immediately during loading and remains available per hero when loading fails.

`HeroAssetCache` owns loaded geometry/textures and request caching. Each `HeroVisual` gets its own cloned skeleton, animation mixer and mutable material instances. Authored paint is retained; wireframe is applied to the instance. Movement drives idle/walk blending. Bacchus additionally uses the upper-body keyframes in `components/game/bacchus-combat.ts`: a two-hand ready grip, basic polearm strike and a wider Arc Cleave. His Thyrsus-style polearm attaches to `hand_R`; the support hand is fitted to the shaft while baking intermediate poses at 30 Hz. These runtime clips replace only the corresponding upper-body rotation tracks in locomotion; the GLB files and their copy receipt are unchanged. His legs and root continue using the original idle/walk. Other heroes retain a small group-level attack accent, and defeat still tips the visual group; neither is an authored combat/death clip.

`Scene.tsx` owns world position/facing, selected-slot rings, camera anchors and combat effects. It replaces only the character artwork and disposes visual/cache resources when the scene is rebuilt or unmounted. The combat kernel, save format and multiplayer messages do not depend on the imported bone layout.

## Replace or extend a character

1. Prepare a self-contained GLB with the same hero ID/URL, scale, forward direction and grounding. Preserve `idle`/`walk`, or deliberately extend the adapter for new named clips. Keep weapons separate when adding attachments; the current exports have no weapon meshes.
2. Replace only the corresponding file, then update `manifest.json` with the new revision, byte count and SHA-256. Keep private workstation paths out of public metadata.
3. Run `tests/character-assets.test.ts`, which reads the expected receipt from `manifest.json`, and the adapter tests in `tests/hero-assets.test.ts`. Update tests only if the intended asset contract changes. Check embedded textures, skinning, clip names and resource ownership; do not weaken checks to conceal a broken asset.
4. Run `npm test` and `npm run typecheck`, then the project's lint/build checks. In the browser, check all five heroes, +Z facing, feet, idle/walk transitions, fallback, wireframe, graphics changes, slot selection and cleanup. Check combat animation/prop attachment separately if it changed.

Bacchus strikes consume only `auto` and `weapon` presentation events. Arc Cleave has its own wind-up, sweep and recovery; the other weaponskills currently reuse the basic strike. The short, pooled polearm ribbon follows the actual weapon, and the arena impact effect waits for the strike's presentation contact time. Damage, TP, cooldowns and network authority remain in the combat kernel; the animation never determines whether a hit occurs. Defeat, encounter reset and teardown clear animation/trail state and release the prop resources. The unchanged GLBs still contain only their original idle/walk clips.

A model replacement needs no combat rewrite. New weapon choreography can consume existing presentation events while the kernel continues deciding hits and timing. Refining a model also does not change its narrative identity; see [LORE.md](LORE.md).

## Validation status

The original integration checkpoint passed **106 automated tests, typecheck and full lint**. The existing in-app browser preview loaded **five models with zero model-load failures and no warning/error logs**. Browser checks covered selecting Ariadne with Enter and camera follow, switching scaffold/painted characters, both High and Performance graphics, and toggling wireframe across asynchronous reloads; the painted roster was viewed in the arena. These integration checks are complete. They are not a deployment receipt, target-device performance benchmark, physical-controller test or multiplayer validation.

The source audit validated binary/accessor ranges, finite values, indices, materials/textures, 22-joint skin references and normalized weights with at most four influences. Both clips contain changing channels and matching loop endpoints. Supplied previews show soft facial/hand detail; Ariadne's shoulder drape needs motion review. Binary validity does not establish collision-free deformation, planted feet or finished combat animation.

The total above describes source geometry and transfer bytes. It excludes scene geometry, render passes, decoded texture/GPU memory and animation cost. Use real browser telemetry and a five-character encounter when setting a runtime budget.

## Bacchus first combat pass — 2026-10-23

All 110 tests pass, including actual-rig checks for the two-hand grip, finite bone transforms, foot/root preservation, independent instances, recovery, revival and exactly-once prop disposal. Typecheck and the production build pass. Close-up browser review covered the front and side poses, basic strike and Arc Cleave; the built five-hero encounter was exercised with movement, auto attacks and Arc Cleave from the normal ability bar, with no new browser warnings/errors. Three.js scene loading is deferred to the browser to avoid Worker-global loader initialization during SSR. This is a first runtime animation pass; finger animation, authored hit/death clips and the other heroes' combat choreography remain future work.
