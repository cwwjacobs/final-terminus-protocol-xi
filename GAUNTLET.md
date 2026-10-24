# Reviewer packet (the gauntlet)

You are an independent reviewer with no stake in this build. You did not write it and you
will not fix it. Below are the loop map and the receipts. Answer one question only:

**Which receipts do not prove their exit check?**

For each loop, say one of:
- PROVEN: the receipt's command is the exit check in the map, the output shows pass, the exit
  code is 0, and the named files are the ones the loop was allowed to touch.
- NOT PROVEN: say what is missing (wrong command, output does not show the pass condition,
  nonzero exit, files outside the loop's bound, receipt is a description rather than output).
- NO RECEIPT.

Then list anything the receipts show that the map did not authorize. Do not propose fixes;
findings go back to Stage 1 as the next loop list. Quote receipts verbatim when you cite them.

---

# LOOP_MAP.md

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

---

# RECEIPTS.md


## Receipt: loop 1

- time: 2026-10-24T04:15:13Z
- cwd: /workspace/scratch/86df643da5ef/terminus-public-release
- command: `npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs`
- exit code: 0
- files:
  - game/types.ts sha256=5d9ae0dc66c85a37cab13fcf4092ffc9e84d526d40a294cdbef6ffb381809079 bytes=3169
  - game/engine.ts sha256=be169ded770aaa4e5be4d3ba930a868d579eead7d4dfd0d5a1ec79aabdd7b2d5 bytes=32431
  - game/run-stats.ts sha256=7ee2ec51cf11b2fcc66d3f6e20d935eabd652feade17ce8711f342129f812bf6 bytes=1402
  - lib/state-migrations.ts sha256=996a1835cd4c22e9ec69cda6d28c2c4d8185ae8bbfcf4f5d0470845886a5e208 bytes=2978
  - lib/local-save.ts sha256=20840f2c0d29331ae6c499bc30c6f19d62cab2e8a5946ccc3186c2ef2361b6f1 bytes=9029
  - components/game/EncounterResult.tsx sha256=b8b08a52b00bbaf1aef8344f2c8a13f723168646520c4e055173076d26a6468a bytes=5132
  - components/game/GameClient.tsx sha256=77cd6810299df3264e4d28f94326c77705a35e4a68595fe9bc4d3c12dafef0d2 bytes=46441
  - app/globals.css sha256=03fe7cb0b4749636172a26b3f8449cf48dc774b14340633a8d591644591e77cd bytes=70240
  - tests/run-stats.test.ts sha256=11ecf8ce61d39dd88ea366e53e1479c0e0f45c5ec1b619bad76c541b08e97d08 bytes=9970
  - tests/rooms.test.ts sha256=f77a62c868ceadd69c6a15929d8c0e256cea87524dd33fe132f303a2f8717558 bytes=25143
  - docs/RUN-STATS.md sha256=0026674c9604aa425fb85a1ec7b8945db9ed566eaf7e13d637870d79f0bf4084 bytes=1985

```
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> final-terminus-protocol-xi@0.1.0 test
> node --experimental-strip-types --test --test-isolation=none tests/*.test.ts

✔ library receipt matches the file and covers every clip the role map references (24.564841ms)
✔ events map to role clips; log lines and boss casts do not (0.304539ms)
✔ upper-body actions take the arms, leave the legs on locomotion, and hand back cleanly (20.43487ms)
✔ running takes over from walking by speed, with weights that always sum to one per bone (15.170008ms)
✔ reserved bones (Bacchus polearm pose) are never written by the library (10.630374ms)
✔ Bacchus strikes only for attack events, with a separate Arc Cleave (0.246894ms)
✔ real Bacchus rig keeps both grips together through wind-up, impact and recovery (34.164485ms)
✔ strikes leave root and feet on the existing locomotion, and never move another instance (30.140131ms)
✔ death cancels strikes; revival and repeated attacks recover, with owned props freed once (19.909306ms)
✔ camera starts behind the supplied facing with the agreed default zoom (2.495169ms)
✔ signed orbit looks right and up without changing actor state or yaw on pitch-only input (0.683638ms)
✔ orbit remains independent of actor facing until explicit recenter (0.655617ms)
✔ pitch and distance stop at bounds, and signed zoom moves in the requested direction (0.109091ms)
✔ yaw wraps through a complete orbit without changing its direction (0.076523ms)
✔ positive shoulder moves the view to camera-right for both forward conventions (0.195318ms)
✔ pose clamps height and shoulder without mutating caller state (0.148319ms)
✔ invalid inputs and every bound combination produce a finite pose above the floor (0.647424ms)
✔ short viewport projection clears the actual dock while the larger view stays unchanged (1.206138ms)
✔ viewport framing shift is bounded and handles missing or invalid layout safely (0.451025ms)
✔ camera locks only for the controlled living engaged actor and releases with encounter state (1.905049ms)
✔ combat tracking faces the enemy from every side without changing game state or zoom (2.286401ms)
✔ look input cannot break engagement lock, zoom works, and free orbit resumes without a snap (0.236759ms)
✔ tracking crosses the yaw seam along the short arc and avoids whips at target overlap (0.162389ms)
✔ the five shipped heroes match the immutable copy receipt and runtime URLs (35.363783ms)
✔ shipped GLBs include self-contained textures, skins and the two supported motion clips (16.081542ms)
✔ a lone weaponskill never advertises any magic burst; only a timed compatible closer lights up (1.552038ms)
✔ each completed chain highlights only its matching available spell and records both actors (5.325833ms)
✔ wrong weaponskills and encounter end cannot create or retain a burst cue (0.269808ms)
✔ Dolos self-chain cue requires the live one-use permission and existing timing (0.364748ms)
✔ intervening multi-hit abilities do not replace the real chain opener in attribution (0.61758ms)
✔ root command order is stable and Items does not imply an implemented inventory (0.388794ms)
✔ opening cannot also activate Attack; Attack engages but never toggles an engaged actor off (1.938107ms)
✔ nested spells preserve ally/adversary meaning and back closes one level at a time (0.251791ms)
✔ role-filtered pages expose only existing permissions, with honest empty categories (0.290899ms)
✔ fresh resource/cooldown state blocks stale selections without mutating combat (0.303637ms)
✔ navigation wraps safely through disabled rows and empty menus; right never fires actions (0.169229ms)
✔ enemy marks show the compatible next action, then only the resulting burst element (3.779764ms)
✔ ready party follows without pulling; engage starts auto attacks and TP; cap is 3000 (2.732209ms)
✔ movement normalizes diagonals, accepts independent facing, and clamps arena radius (2.759789ms)
✔ malformed actions, slots, time deltas and inherited weapon keys cannot mutate state (0.906497ms)
✔ weaponskill checks TP, range, engagement and cooldown before spending all TP (0.678521ms)
✔ each documented two-actor sequence creates its matching chain and burst element (1.090117ms)
✔ same actor, too-early closer and expired window do not produce skillchains (1.839412ms)
✔ matching magic bursts, wrong element does ordinary damage, and burst expiration works (2.199223ms)
✔ volatile enmity decays; Provoke changes target; damage taken erodes cumulative enmity (0.205273ms)
✔ healing prioritizes low health, generates hate, costs MP and cannot resurrect (0.609468ms)
✔ telegraph geometry agrees with resolution; guard mitigates a raid; fallen actors cannot act (0.266954ms)
✔ trust replacement changes only chosen slot and zeroes stale movement (0.614976ms)
✔ fixed-step replay is deterministic across elapsed-time partitions and JSON save roundtrip (3.131637ms)
✔ one player plus four trusts sustain the complete trial and god encounter loops (82.999486ms)
ℹ trial: victory in 117.45s, 32 skillchains, 26 magic bursts, 3 phases
ℹ god: victory in 358.05s, 104 skillchains, 56 magic bursts, 3 phases
✔ party wipe closes the encounter and events remain bounded (13.522499ms)
✔ god collapse uses combat elapsed time, warns visibly, and defeats an idle player with trusts (34.933017ms)
✔ accessible trial has no deadline and trusts can finish when the player remains idle (14.742558ms)
... (234 more lines)
```

Receipt attached, awaiting seal.
