# Changing and upgrading the game

Start with the smallest module that owns the behavior. Keep the shared kernel, presentation and transport boundaries intact; a new weapon skin should not require rewriting combat, and a balance adjustment should not require rebuilding the HUD. This guide describes the current seams and where an extension still needs real implementation.

## Find the right edit

| Change | First place to edit | Check the connected boundary |
| --- | --- | --- |
| Auto-attack speed/damage, TP gain, ranges or party resources | `game/content.ts`: `ROLES`, `PARTY`, timing/range constants | Kernel tests and a short fight with the affected role; UI descriptions must still match |
| Weaponskill damage or names | `game/content.ts`: `WEAPONS` | `components/game/catalog.ts` supplies displayed ability labels; balance values belong in content |
| Skillchain pair, element or timing | `game/content.ts`: `SKILLCHAINS`, `WEAPONS.next`, `CHAIN_*`, `BURST_WINDOW` | `trustAction` uses `WEAPONS.next`; update it consistently with recipes, field-guide recipes and chain/burst tests |
| Role kit or action permission | `game/content.ts`: `canUseActionRole`, `ROLES`; then `game/engine.ts`: `trustAction` when behavior changes | The kernel and HUD share the permission function. Add allowed/denied-role tests; online request validation still accepts only known action shapes |
| New action or resource | `game/types.ts`, then `applyAction` and content definitions | Also extend `lib/rooms.ts` validation, HUD catalog, input mapping and save compatibility. A client button alone does not implement an action |
| Ability icon, label or displayed key hint | `components/game/catalog.ts` names the icon; `components/game/icons.ts` holds the outline | Bindings and labels come from `control-settings.ts`; device behavior lives in `input.ts`. Ability marks are shared with the enemy mark, so a changed outline changes both |
| HUD icon shape (navigation, portraits, status, arrows) | `components/game/icons.ts`, rendered by `Icon.tsx` | Icons are 24-unit (or 64-unit mark) outlines drawn with `currentColor` at `1em`; keep coordinates inside the box and run `tests/icons.test.ts`. Portraits use the same shape as the role's floor ring in `party-markers.ts` |
| Floating damage/heal number appearance | `components/game/combat-glyphs.ts` for outlines and spacing, `floating-feedback.ts` for size, color, stroke, depth slab, camera-distance scale, spawn punch and tilt (all motion is off under `prefers-reduced-motion`) | Numbers are vector glyphs referenced through pooled `<use>` nodes, never text; `combatNumber()` in `world-feedback.ts` still decides what is shown. Digit outlines are Cinzel ExtraBold under the OFL (`vendor/cinzel.LICENSE`); a new character needs an outline in `CHARACTER_GLYPHS` or it is dropped, not mis-drawn |
| Keyboard, mouse or controller binding | `components/game/control-settings.ts` for defaults/schema, `input.ts` for device behavior | The HUD reads current bindings; update command metadata and `tests/input.test.ts`; test the physical controller separately |
| Painted party mesh, material or animation | `public/assets/models/`, its `manifest.json`, and `components/game/hero-assets.ts` | Preserve the `HeroVisual` adapter used by `Scene`; update asset tests, verify textures/forward/grounding and inspect playback/disposal in a browser |
| Which clip an action plays, its contact time or body mask | `components/game/role-animation.ts` | One row per role per action key; clip names must exist in `public/assets/animations/hero-animations.glb` (`tests/animation-library.test.ts` enforces it). See [ANIMATION-PIPELINE.md](ANIMATION-PIPELINE.md) |
| The shared clip library itself | `scripts/animation/retarget.py` → `public/assets/animations/hero-animations.glb` + `.json` receipt | Rebuild from the CC0 kits with a T-pose reference; never hand-edit the GLB. The receipt's `placeholder` flag says whether clips are real retargets |
| A hero's weapon prop | `components/game/hero-props.ts` (Bacchus: `bacchus-combat.ts`) | Attach to hand/forearm bones; own and dispose every geometry/material; `tests/hero-props.test.ts` |
| Procedural fallback or boss mesh | `components/game/actors.ts` | Preserve world roots, rings and the scaffold adapter; check telemetry and disposal |
| Follow-camera distance/height/smoothing | `components/game/camera.ts`, then its adapter in `Scene.tsx` | Preserve automatic camera lock while the controlled actor is engaged, free orbit after disengaging, camera-relative movement and zoom; test walls/obstructions when those are introduced |
| Arena appearance | `buildWorld` in `components/game/Scene.tsx` | Shared arena dimensions and damage geometry come from content/kernel; visual scenery is not collision data |
| Arena size or collision rules | `ARENA_RADIUS` in content, `bounds` and telegraph checks in the kernel | Rendering imports shared radius/angle. Larger maps need explicit collision, navigation and camera handling, not only a larger floor |
| Boss HP, phases, attacks or deadline | `createGame`, `bossStep` and telegraph handling in `game/engine.ts`; `GOD_ENRAGE_*` in content | Add mechanism tests for new attacks and rerun the scripted encounter. Telegraph shape and damage must agree |
| Encounter title or story premise | `docs/LORE.md`, then `game/lore.ts` | Update visible copy deliberately; changing a model or combat identifier must not silently change narrative meaning |
| Polling, room lifetime or reconnect behavior | `lib/rooms.ts`, API route and the online loop in `GameClient.tsx` | Preserve server-time authority, token ownership, sequence deduplication and CAS; run room tests and a real multi-client check |
| Local save format | `game/types.ts`, `lib/local-save.ts`, save lifecycle in `GameClient.tsx` | Introduce an explicit version/migration policy before removing or redefining saved fields; test restored state through a kernel step |

`catalog.ts` owns presentation metadata, not damage or ability permissions. `local-save.ts` owns validation, while `GameClient` still owns browser storage and session orchestration. These are deliberate small extractions, not a new framework or a blanket rewrite.

## Upgrade painted character assets

The party now loads five painted GLBs by default. **Settings → Characters → Original scaffold** selects the procedural models; a failed GLB load also leaves that actor's scaffold visible. `HeroAssetCache` in `components/game/hero-assets.ts` loads and caches assets, clones independent skeletons/materials, blends idle/walk, and owns resource cleanup. `Scene.tsx` attaches each `HeroVisual` while retaining its existing world root, facing, selection ring and camera behavior.

For an art revision, replace the appropriate GLB in `public/assets/models/`, update its byte size/hash and revision in `manifest.json`, and update the asset receipt tests. Keep hero IDs and URLs stable unless a deliberate mapping change is needed. Preserve metre scale, +Y up, +Z forward, feet near Y=0, embedded PBR textures and the named `idle`/`walk` clips. The GLBs contain no weapon props or combat clips. Bacchus's first combat pass is authored at runtime in `components/game/bacchus-combat.ts`: a hand-attached Thyrsus-style polearm and upper-body ready, basic strike and Arc Cleave clips. Edit its key poses to revise the choreography, and preserve the locomotion track filter so the legs/root remain controlled by idle/walk. New GLB combat clips can replace this layer in a later art pass.

Keep the shared kernel authoritative for hits, damage and timing. Replacing art does not require a combat rewrite. Run the asset/cache tests, then inspect loading/fallback, movement, wireframe, both graphics settings, slot changes and teardown in the browser. Compare telemetry when assessing performance; the imported file/triangle counts alone are not a benchmark. See [CHARACTER_ASSETS.md](CHARACTER_ASSETS.md) for provenance, current measurements and the concrete replacement checklist. Keep party identity, replaceable scaffold, authored skin and narrative role separate, as [LORE.md](LORE.md) describes.

The current boss factory is `createCrownResonance` in `actors.ts`. Replace that factory's art implementation when upgrading the boss mesh; edit displayed story names through lore copy. Keep runtime identifier changes deliberate and update their imports together.

## Expand networking in a separate step

Current online play uses HTTP full-state snapshots, a 250 ms delay after each completed poll, a 20 Hz fixed kernel and a one-second idle catch-up cap. D1 revisions prevent competing requests from overwriting newer state.

A future WebSocket transport needs an authoritative room process that owns continuous ticking, plus snapshot/delta delivery and a deliberate interpolation or prediction/reconciliation policy. Keep actions bounded and server-validated; never accept client damage, elapsed time or a local save as authority. Preserve session/slot ownership, reconnect expiry and sequence deduplication while replacing the transport. D1 can become a checkpoint store, but that scheduler and persistence change need their own implementation and tests.

The room code is an invite to an encounter, not a Site access credential. Testing with another person requires both the right Site access policy and an available room slot.

## Change saves without losing their meaning

`GameState.version` and the `terminus-xi-save-v1` storage key currently identify version 1. Validation rejects malformed required fields instead of running corrupt state. There is no migration pipeline yet.

For an incompatible state change, define the new version and either a tested old-to-new migration or an explicit fresh-start policy. Validate the migrated result before stepping the kernel. In particular, changing combat clocks, resource meaning, role IDs or action cooldowns is more than a TypeScript edit. D1 rooms also store serialized `GameState`; choose whether existing rooms migrate or expire as part of the same release. Changing only the local storage key does not upgrade online rooms.

## Verify the particular change

Use the closest mechanism test while developing; then run the project checks before a milestone:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Rendering/input changes also need browser interaction. Network changes need two independent clients against the actual API/database. Controller support needs physical-device testing. Scripted encounter duration measures the programmed policy in the test, not human balance; update duration claims only from fresh diagnostics and keep that qualification.

For schema changes, generate a new migration with `npm run db:generate` and apply it to the local database using the command in [README.md](../README.md). A new game-state field inside the room JSON does not necessarily produce a SQL schema migration; it still needs the save compatibility decision above.

## Local files, GitHub and Sites are separate milestones

- Local files are the editable source. A Git commit records a checkpoint; it does not change a hosted game.
- The configured GitHub repository is source backup and history. A push does not by itself publish this Sites deployment or grant Site access.
- Sites builds and publishes the running web application and applies its hosted database migrations. Site access policy is managed separately from source visibility and room codes.

Review the concrete source/build before publishing, and verify the running version after publication. Keep generated caches, local database contents and room/session credentials out of source backups. No deployment or sharing action is implied by editing one of the modules in this guide.
