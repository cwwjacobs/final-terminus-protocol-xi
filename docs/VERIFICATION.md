# First playable milestone — verification

This is a playable combat foundation with procedural art and one encounter, not a finished MMO. The current source was checked locally on 2026-10-19/20. Deployment and GitHub synchronization receipts are reported separately from these checks.

## Automated mechanisms

`npm test` passed 42 tests. Coverage includes TP spending, distinct-actor skillchains, timing boundaries, matching-element bursts, enmity decay and target changes, role restrictions, telegraph geometry, guard, deterministic replay, trust replacement, malformed inputs and local-save bounds. Input tests cover dead zones and camera-relative movement.

TypeScript (`npm run typecheck`), the full ESLint run and the Sites production build passed. The build still reports a client chunk above 500 kB, largely the 3D stack; initial download cost remains an optimization target. This warning is separate from measured frame rendering cost.

The scripted active player plus four normal trusts completed the trial in 116.50 seconds (29 skillchains, 15 bursts) and the god encounter in 363.85 seconds (93 skillchains, 49 bursts), reaching all three phases. An idle leader loses god mode at 450 combat seconds. These are repeatable test-policy results, not measured human balance.

Room tests cover five-slot capacity under forced concurrent writes, session isolation, sequence deduplication, trust takeover, reconnect reservation, token revocation, expired rooms, bounded catch-up and request validation. Save tests reject oversized finite remainders that could otherwise stall restoration, unknown roles, invalid resources and invalid chain owners; 600 generated built-in states remain loadable.

## Actual local API and browser

A separate HTTP integration run used the built Worker and its actual local D1 database. It created a room, joined four clients concurrently into unique slots, rejected a sixth player, rejected a forged token, accepted independent player inputs, entered combat, deduplicated retries, restored a disconnected slot to trust control, reconnected and left. This is distinct from the in-memory repository tests.

Two independent browser tabs joined one room as Bacchus and Heracles. Both showed the same changing boss health and combat clock. Each player's Guard produced its own named combat event and cooldown; Bacchus's event was visibly replicated in the other tab. Keyboard magic was also exercised while controlling Hecate in solo play. No browser console errors were observed during these checks.

Visual inspection caught the controlled character being obscured by the HUD; the follow-camera height and look point were adjusted. The body and feet are visible above the action panel at the tested desktop viewport. Focus loss clears movement to prevent stuck input. Procedural rigs were exercised across 600 animation steps without nonfinite transforms.

At the tested 1625×901 desktop viewport, observed high-quality samples ranged roughly from 126 to 180 FPS, with about 150 draw calls and 18–19 thousand triangles in a populated view. These are brief measurements on this workstation, not a cross-device benchmark or a sustained performance guarantee. The HUD exposes live counters for subsequent testing.

## Remaining limits

- Physical gamepad hardware, controller menu navigation and remapping are not verified/implemented respectively. Combat mapping is implemented through the standard browser Gamepad API.
- Two local browser clients and five API sessions do not establish WAN latency, five-device play or service-scale load. The current transport is HTTP snapshots; continuous authoritative WebSocket rooms are an explicit upgrade path.
- This milestone targets desktop keyboard/mouse or controller play. It has no touch movement controls, camera collision, open-world streaming, inventory or account progression.
- Saves belong to the current browser/origin. Online sessions are separate and rooms expire after 24 hours; they are not permanent character progression.
- Private Sites access and room invitations are separate. A room code cannot grant another person access to an owner-private Site.
- The selected divine-amnesia origin is Corey's current decision. Other unresolved lore questions remain marked in `LORE.md`; procedural encounter art does not settle them.

See `ARCHITECTURE.md` for implemented boundaries and `UPGRADING.md` for targeted change paths.
