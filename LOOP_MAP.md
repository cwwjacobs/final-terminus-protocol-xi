# LOOP_MAP — Main-menu hero and control picker

Goal: Main menu visibly exposes Choose hero and Controls & keybinds; one hero picker shows all five characters and persists the choice. Solo and room creation use that hero; joining prefers it when available, and lobby players can choose available hero places. Controls open with input layout and active hero's hotkeys before camera options.
Kernel: Keep compact glass styling, direct role ability mappings, saved custom bindings, menu/back flow, music and scoreboard, authoritative five-slot rooms, host permission, reconnect reservations and session-token privacy.
Out of scope: Combat balance, hero models/animations, duplicate characters, matchmaking.
Authorization: User explicitly requested hero picker, main menu and hotkey mapper/control picker on the main menu. Prior GO, main synchronization and publication authorization persist.

| Loop | Goal | Allowed files | Exit check | Status |
|---|---|---|---|---|
| 3 | Deliver hero choice and discoverable controls across local/room flows | components/game/MainMenu.tsx, HeroPicker.tsx, main-menu.css, hero-picker.css, ControlsPanel.tsx, controls-panel.css, GameClient.tsx, control-settings.ts helpers if needed, lib/rooms.ts, related tests, docs/*, LOOP_MAP.md, RECEIPTS.md, GAUNTLET.md | npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs | Receipt attached: 252 tests, typecheck and production build pass; independent review complete, awaiting Operator seal |

Whole-build: command above and browser main-menu → hero picker → controls mapping → local/room hero checks where available. Independent review must check room slot transfer, host identity, stale snapshots and custom binding preservation. Hardware/3D/simultaneous-client browser limits remain explicit. Parallel tasks own separate files in one authorized loop; root integrates and publishes.
