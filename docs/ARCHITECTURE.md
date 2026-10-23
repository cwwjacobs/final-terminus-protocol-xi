# Architecture and extension path

The foundation separates combat rules, player input, presentation and room authority. The same deterministic rules run locally and on the server. Improving the character art should not require rewriting TP, skillchains, enmity or trust behavior.

## Source map

| File | Responsibility |
| --- | --- |
| `game/types.ts` | Serializable `GameState`, actor records and bounded `Action` vocabulary |
| `game/content.ts` | Party/role definitions, weapon recipes, magic names, ranges and timing constants |
| `game/lore.ts`, `docs/LORE.md` | Editable in-game copy, current story decisions and adaptation boundaries |
| `game/engine.ts` | Fixed-step combat, movement, trusts, enmity, boss phases and action validation |
| `components/game/GameClient.tsx` | HUD, local simulation/save lifecycle, selected slot and online session orchestration |
| `components/game/catalog.ts` | Ability labels, glyphs, displayed control hints and action intents |
| `components/game/control-settings.ts` | Validated default bindings, conflict handling, labels and persisted preference schema |
| `components/game/input.ts` | Keyboard, mouse and browser Gamepad API translated into combat or local camera/target commands |
| `components/game/camera.ts` | Bounded independent camera orbit, pitch, zoom and pure world-space pose |
| `components/game/ControlsPanel.tsx`, `targeting.ts` | Remapping UI and client-only target cycling |
| `components/game/CommandMenu.tsx`, `command-menu.ts` | Compact command folders, pure navigation and fresh action availability; combat continues during selection |
| `components/game/Scene.tsx` | Three.js scene, follow camera, telegraphs, pooled effects and telemetry |
| `components/game/world-feedback.ts`, `floating-feedback.ts`, `party-markers.ts` | Presentation event baselines, fixed number pools and role/selection/TP/low-HP markers |
| `components/game/actors.ts` | Procedural articulated rigs, reusable asset resources and animation adapter |
| `lib/rooms.ts` | Request validation, room leases, server-time advancement, CAS and D1 repository |
| `lib/local-save.ts` | Local save validation independent of the React HUD |
| `app/api/rooms/route.ts` | HTTP boundary, Cloudflare DB binding and safe error responses |
| `db/schema.ts`, `drizzle/` | Room persistence schema and migration history |
| `tests/` | Mechanism, adversarial boundary, replay, sustained encounter and input tests |

## Combat kernel

`createGame(mode)`, `applyAction(state, slot, action)`, `stepGame(state, elapsedSeconds)` and `setHuman(state, slot, human)` are the kernel boundary. State is plain serializable data; there are no renderer, browser or database dependencies in the kernel. `stepGame` mutates state in 50 ms increments, retaining fractional elapsed time for the next call.

Actors hold HP, MP, TP, engagement, cooldowns, position/facing, cumulative enmity (`ce`) and volatile enmity (`ve`). The boss chooses among living eligible actors by total enmity. Trusts use the same actions and combat restrictions as player inputs, with role-specific decision logic. Each actor's `human` flag selects whether trust logic controls that slot. `canUseActionRole` in `content.ts` is shared by action validation and the HUD: the three physical roles use weaponskills, the arcanist casts, the luminary heals, and the warden provokes.

The chain opener, chain window and burst window are explicit state. The sequence requires a distinct second actor; merely repeating a weaponskill on the same actor does not close the chain. Weaponskills require at least 1,000 TP, consume all TP and apply a damage multiplier for the amount spent. Boss circle, cone and raid telegraphs are also state, so rendering and collision checks use the same attack description. The renderer imports the kernel's arena radius and cone angle.

The event list is bounded to 60 entries, with monotonic event IDs. Presentation consumes these events for attack motion and effects; animations do not decide whether damage happened. Heal events optionally identify the recipient party slot independently of the caster. Older events remain valid. A local presentation epoch on encounter/session replacement baselines history and clears effects; it is not sent as a combat action or stored as server authority.

`combatTime` starts at engagement and advances only during combat, separately from total simulation time. God mode warns at 420 combat seconds, begins the ten-second Coherence Collapse cast at 440, and defeats the party at 450 if the boss remains alive. This prevents an indefinitely sustained encounter; guard and evade cannot bypass that deadline.

Current story authority is [LORE.md](LORE.md), with visible copy in `game/lore.ts`. Zeus made Ariadne, Bacchus, Dolos and Hecate amnesiac guardians of the Middle Plane. Their godhood emerges when they descend into the Quantum Realm. Four original descenders and five active party slots are separate facts; Heracles's entrance remains open. The encounter adaptation is Crown Resonance at Crowned Horizon, replacing the prototype Hollow Regent. Crown Resonance is not Logos, and its defeat does not establish that the realm or its inhabitants are healed. Keep story edits separate from balance and rendering changes.

## Local execution and storage

The local client advances the kernel from a 100 ms UI timer, allowing the kernel to perform its 50 ms steps. It caps each local elapsed-time submission at 150 ms and skips advancement when paused or the document is hidden. Three.js renders independently with `requestAnimationFrame` and smooths the visible transforms toward simulation positions.

The local save key is `terminus-xi-save-v1`; it stores the state and selected slot in `localStorage`. `lib/local-save.ts` validates required fields, finite clocks/cooldowns, safe counters, a bounded tick remainder, known roles, actor vectors/resources and chain ownership before loading. Restoring resets the human/trust flags to one selected player. Settings use `terminus-xi-settings`. This is device/browser/origin storage with a version-1 format, not cloud progression or a full save-migration system.

Online credentials use `sessionStorage` under `terminus-xi-room-v1`. Local saves are not accepted by the server. Creating an online room initializes a new server-owned game for the current mode.

## Online authority

The client sends only intents. It retains the latest movement intent and queues up to ten other actions, then sends them in a single sync packet. The next request starts 250 ms after the previous one completes; effective snapshot frequency is therefore below 4 Hz when network/processing time is included. Retries preserve the packet's sequence number.

The POST endpoint is `/api/rooms`:

| Operation | Request fields | Response |
| --- | --- | --- |
| `create` | `op`, optional `mode` (`trial` or `god`) | `code`, `token`, `slot`, `state`, `revision` |
| `join` | `op`, `code` | `code`, `token`, `slot`, `state`, `revision` |
| `sync` | `op`, `code`, `token`, `seq`, `actions` | `slot`, `state`, `revision`, optional `actionErrors` |
| `leave` | `op`, `code`, `token` | `{ "ok": true }` |

Codes and tokens each contain 128 cryptographically random bits, encoded as 32 lowercase hexadecimal characters. Stored occupants contain a SHA-256 hash of the room-bound token, not the raw token. Snapshots expose game state, not private occupant records. The API limits bodies to 8 KiB and 12 actions, validates finite movement and known action fields, and rejects client-supplied state, damage or time. It never uses client timestamps to simulate combat.

D1 stores one document per room, plus a revision and expiry. Each mutation reads a snapshot, advances using server wall time, applies validated actions, and writes only if the previous revision still matches. A competing write causes a fresh read and retry, up to eight attempts. Tests force overlapping join reads to prove five-slot capacity survives actual revision conflicts. Repeated or older action sequence numbers return the existing snapshot without replaying effects or extending the player's lease.

Presence rules:

- Movement expires after approximately 600 ms without an accepted sync.
- After 8 seconds without an accepted sync, the character becomes a trust.
- The secret token retains ownership for 45 seconds from the last accepted sync. During that window the player can reconnect; another join cannot steal the slot.
- Explicit leave revokes ownership immediately. Expired ownership can be replaced by a new join, and old tokens then fail.
- A room expires 24 hours after creation. Access fails after expiry; expired rows are pruned when another room is created.

Each request catches up at most one second of simulation in fixed steps. There is no continuous server timer while a room has no requests, and a long period of inactivity is not replayed in full. The 20 Hz kernel describes simulation resolution, not 20 network snapshots per second.

Site access remains an independent boundary. A room invite authorizes joining an available slot only after the visitor can reach the Site. An owner-private Site does not become shareable through an invite code.

## Graphics and performance

`Scene` receives state and the controlled slot. It does not own combat. Its camera starts behind the active rig, then consumes independent camera yaw/pitch/distance from `camera.ts`, with smoothing toward the desired position and look target. Height and shoulder offset adjust framing. Camera orbit does not mutate character facing or server state. Movement uses this camera yaw; recenter explicitly realigns it with the actor. Character transforms interpolate toward received state; there is no client-side prediction or network rollback in this milestone.

`ActorAssets` caches primitive geometry/materials, and rigid pieces within individual joints are batched while the limbs remain articulated. World pillars, ornaments and shards are instanced. Combat uses a fixed pool of 18 effect objects. High quality caps device pixel ratio at 1.5 and uses shadows; Performance caps it at 1 and omits shadows. GPU resources and event listeners are disposed when the scene unmounts or is rebuilt.

These are implemented cost controls, not a promise of a frame rate across hardware. The on-screen FPS, draw-call and triangle counters provide the measurement points for subsequent asset work.

## Extension seams

The intended maintenance style is small changes at the relevant boundary, preserving the other modules. [UPGRADING.md](UPGRADING.md) gives concrete edit-and-check paths; it does not require a broad refactor before each improvement.

| Next layer | Where to extend | Contract to preserve |
| --- | --- | --- |
| Rigged GLB party and boss models | Replace factories in `actors.ts` with cached GLB loading and an `ActorRig`-compatible adapter | Keep world transform, marker, role/color identity and animation handles outside the combat kernel; share loaded resources safely across instances |
| Animation clips and richer effects | Extend the rig adapter and `Scene` event consumption | Drive clips from movement and event IDs; animation timing must not author damage or network state |
| More weapons, magic and encounters | Extend definitions in `content.ts`, action types and the relevant engine rules | Keep client and server on one schema; cover new chain recipes, timing and combat boundaries with mechanism tests |
| Larger maps and terrain | Extract `buildWorld` from `Scene`; replace kernel arena bounds with an explicit map/collision contract | Use authoritative collision data, not visual mesh placement alone; add chunking/LOD, camera collision and navigation as actual systems |
| Lower-latency multiplayer | Replace HTTP polling with an authoritative room process and WebSocket snapshots/intents | Preserve slot ownership, validated actions, sequence deduplication and trusted server time; add interpolation/prediction and reconciliation deliberately |
| Durable progression and transferable saves | Introduce versioned save migrations and an account-backed persistence model | Keep local/imported saves separate from server combat authority; handle Site access and player ownership explicitly |

A continuous room process could own ticking and use D1 for checkpoints rather than writing a full document per poll. That transport and scheduler do not exist yet. Current polling writes and full-state responses are a foundation for a small party, not a measured large-scale multiplayer service.

## Evidence and limits

The scripted encounter test controls one actor programmatically while four trusts run their normal logic. The player moves, avoids telegraphs, guards and selects weaponskills; trusts supply their role-specific support. Current diagnostics report trial victory at 116.50 seconds and god victory at 363.85 seconds, with chains, bursts and all three phases. A separate idle-leader god scenario loses at the 450-second deadline. Those results establish the loop and participation requirement under those test policies; they do not establish difficulty, enjoyment, accessibility or human fight duration.

The gamepad mapping is implemented through the browser Gamepad API, including dead zones and button-edge detection. Physical controller hardware is unverified. Commands provides fixed D-pad/A/B navigation with a remappable opener; settings dialogs retain native keyboard/Tab behavior. Keyboard/action-button remapping and optional inversion are implemented. The renderer has a WebGL failure message, but that is not a substitute for browser/GPU testing.

Tests, TypeScript checks and a production build should remain separate from browser gameplay, multi-client deployment and physical-device checks. These documents make no claim that those latter gates have passed. Publication, access-policy changes and source synchronization are separate milestone operations.

## Controls revision

`terminus-xi-controls-v1` stores validated local bindings and preferences. Hydration finishes before persistence begins. Camera and target commands remain client-only; the room endpoint still accepts the unchanged bounded combat Action vocabulary. `ControlsPanel` consumes shared command metadata, and hotbar hints read the same current settings used by input. Camera math and target cycling are pure modules with direction/boundary tests; DOM input tests exercise suppression and remapping behavior.

Only the current boss is an enemy candidate today. `cycleTarget` wraps a candidate list and returns the same ID for repeated single-target cycling. A separate pulse counter retriggers the selected world marker without changing combat or enmity. Gameplay Tab is intercepted only outside controls/forms/menus; inside dialogs it navigates focus normally.
