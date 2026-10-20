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
| Ability icon, label or displayed key hint | `components/game/catalog.ts` | Actual keyboard/gamepad behavior lives in `input.ts`; changing a label does not rebind the control |
| Keyboard, mouse or controller binding | `components/game/input.ts` | Update the catalog/field guide's displayed hints and `tests/input.test.ts`; test the physical controller separately |
| Party/boss mesh, material or animation | `components/game/actors.ts` | Preserve the rig adapter used by `Scene`; check telemetry and disposal, then inspect the result in a browser |
| Follow-camera distance/height/smoothing | Camera block in `components/game/Scene.tsx` | Keep it aligned with the controlled actor and input facing; test walls/obstructions when those are introduced |
| Arena appearance | `buildWorld` in `components/game/Scene.tsx` | Shared arena dimensions and damage geometry come from content/kernel; visual scenery is not collision data |
| Arena size or collision rules | `ARENA_RADIUS` in content, `bounds` and telegraph checks in the kernel | Rendering imports shared radius/angle. Larger maps need explicit collision, navigation and camera handling, not only a larger floor |
| Boss HP, phases, attacks or deadline | `createGame`, `bossStep` and telegraph handling in `game/engine.ts`; `GOD_ENRAGE_*` in content | Add mechanism tests for new attacks and rerun the scripted encounter. Telegraph shape and damage must agree |
| Encounter title or story premise | `docs/LORE.md`, then `game/lore.ts` | Update visible copy deliberately; changing a model or combat identifier must not silently change narrative meaning |
| Polling, room lifetime or reconnect behavior | `lib/rooms.ts`, API route and the online loop in `GameClient.tsx` | Preserve server-time authority, token ownership, sequence deduplication and CAS; run room tests and a real multi-client check |
| Local save format | `game/types.ts`, `lib/local-save.ts`, save lifecycle in `GameClient.tsx` | Introduce an explicit version/migration policy before removing or redefining saved fields; test restored state through a kernel step |

`catalog.ts` owns presentation metadata, not damage or ability permissions. `local-save.ts` owns validation, while `GameClient` still owns browser storage and session orchestration. These are deliberate small extractions, not a new framework or a blanket rewrite.

## Replace procedural art with GLB assets

The current `ActorRig` in `actors.ts` exposes a world root, articulated handles, selection marker and animation state. A first GLB change can replace one factory while retaining that outward adapter. A rigged model may need an adapter that maps its bones/clips to those handles; loading a GLB alone does not establish that mapping.

Keep asset loading/caching and resource disposal in the presentation layer. Preserve the actor's world position/facing and the selected-slot marker. Drive animation from movement and combat event IDs; the server/kernel continues to determine hits, damage and timing. Compare FPS, draw calls and triangles before and after the replacement in both quality settings. Keep party identity, replaceable scaffold, authored skin and narrative role separate, as [LORE.md](LORE.md) describes.

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
