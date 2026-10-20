# Final Terminus Protocol XI — first playable milestone

Build the real-time combat kernel first, then independently attach rendering/input and network transport. This is a new game; previous Terminus material supplies lore and visual vocabulary, not its turn-based rules.

1. Kernel: fixed-step deterministic simulation; five party slots; auto attacks earn TP, weaponskills combine into skillchains, compatible magic bursts; persistent and decaying enmity; trust tactics; phased sustained boss fight. Test and checkpoint.
2. Branches: Three.js follow camera/character presentation, accessible HUD, keyboard/gamepad controls and local save; authoritative D1 rooms accepting bounded intents, five human slots with trust replacement and reconnect. Integrate against one shared kernel.
3. Verify real gameplay and two-client room behavior, build, commit locally, synchronize the user-specified GitHub repository, publish private Sites version. Record verification and limitations precisely.

Assumptions: a first playable raid arena is the right base for the requested long god fights; procedural characters are acceptable. Terminus lore will be grounded in recovered source files. Remote repo is currently empty and public; it is an authorized source backup destination. Sites begins owner-private.

## Exact delegated prompts

- Lore: Read-only research task. Recover exact Terminus Q lore and visual vocabulary from the existing Terminus source and nearby reference notes. Inspect the supplied video if accessible; report inability honestly. Return grounded lore/roster/visual recommendations and source paths. Do not infer turn-based rules for this real-time game.
- Combat: Implement only game/types.ts, game/content.ts, game/engine.ts and tests/engine.test.ts. Follow the shared contract delivered with your task. Build a deterministic fixed-step real-time combat engine with five party slots, trusts, TP, weaponskills, timed skillchain and burst windows, cumulative/volatile enmity, telegraphed boss phases, victory/wipe and action validation. Tests must exercise mechanisms and adversarial boundaries. Do not edit package or UI files. Report exact exports and evidence.
- Network: Implement only lib/rooms.ts, app/api/rooms/route.ts, db/schema.ts and tests/rooms.test.ts. Follow the shared kernel contract. Provide authoritative D1 rooms with five slots, secret per-player tokens, bounded intents, CAS updates, reconnect and trust takeover on disconnect. Never accept client state or damage. Test isolation, capacity, stale writes and replacement. Do not edit kernel or UI files. Report the API and evidence.
