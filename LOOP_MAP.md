# LOOP_MAP — End-of-run scoreboard

Goal: Show real per-character Damage, DPS, effective Healing, Damage taken and Deaths at the end of each run, including local and online play.
Kernel: Preserve combat balance, deterministic simulation, save compatibility, transparent glass, compact results, visible Close/Replay/Back controls, and independent input layouts. Totals survive event-log truncation. Overkill and overhealing do not count.
Out of scope: Audio, animations, combat balance, historical run archive or public rankings.
Operator authorization: The requested scoreboard and the earlier GREEN/GO authorize implementation, checks, main synchronization and public release. No new approval boundary is introduced.
Whole-build check: `npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs` plus published run-to-results UI check where browser capabilities permit.

| Loop | Goal | Files it may touch | Exit check | Status |
|---|---|---|---|---|
| 1 | Deliver complete scoreboard feature | game/types.ts, game/engine.ts, game/run-stats.ts, lib/state-migrations.ts, lib/local-save.ts, components/game/EncounterResult.tsx, components/game/GameClient.tsx, components/game/dialog-navigation.ts, app/globals.css, tests/run-stats.test.ts, tests/save.test.ts, tests/rooms.test.ts, tests/scoreboard.test.ts, tests/dialog-navigation.test.ts, docs/RUN-STATS.md, LOOP_MAP.md, RECEIPTS.md, GAUNTLET.md | npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs | receipt-attached |

Implementation tasks may run concurrently within this single authorized loop, with separate files and a shared schema. A separate reviewer reads the resulting diff and receipts before publication. New discoveries stay within the above scope; unrelated features return to the Operator.

Integration refinement: focused horizontal table scrolling uses the existing dialog navigation path for both keyboard and controller; Up/Down and Tab continue to move between controls. This is part of making the requested board usable on narrow layouts.
