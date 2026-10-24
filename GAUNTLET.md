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

# LOOP_MAP — Main-menu hero and control picker

Goal: Main menu visibly exposes Choose hero and Controls & keybinds; one hero picker shows all five characters and persists the choice. Solo and room creation use that hero; joining prefers it when available, and lobby players can choose available hero places. Controls open with input layout and active hero's hotkeys before camera options.
Kernel: Keep compact glass styling, direct role ability mappings, saved custom bindings, menu/back flow, music and scoreboard, authoritative five-slot rooms, host permission, reconnect reservations and session-token privacy.
Out of scope: Combat balance, hero models/animations, duplicate characters, matchmaking.
Authorization: User explicitly requested hero picker, main menu and hotkey mapper/control picker on the main menu. Prior GO, main synchronization and publication authorization persist.

| Loop | Goal | Allowed files | Exit check | Status |
|---|---|---|---|---|
| 3 | Deliver hero choice and discoverable controls across local/room flows | components/game/MainMenu.tsx, HeroPicker.tsx, main-menu.css, hero-picker.css, ControlsPanel.tsx, controls-panel.css, GameClient.tsx, control-settings.ts helpers if needed, lib/rooms.ts, related tests, docs/*, LOOP_MAP.md, RECEIPTS.md, GAUNTLET.md | npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs | Receipt attached: 252 tests, typecheck and production build pass; independent review complete, awaiting Operator seal |

Whole-build: command above and browser main-menu → hero picker → controls mapping → local/room hero checks where available. Independent review must check room slot transfer, host identity, stale snapshots and custom binding preservation. Hardware/3D/simultaneous-client browser limits remain explicit. Parallel tasks own separate files in one authorized loop; root integrates and publishes.

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

## Receipt: loop 2

- time: 2026-10-24T05:14:40Z
- cwd: /workspace/scratch/86df643da5ef/terminus-public-release
- command: `npm test > /tmp/terminus-loop2-tests.log && tail -10 /tmp/terminus-loop2-tests.log && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs > /tmp/terminus-loop2-build.log 2>&1 && tail -18 /tmp/terminus-loop2-build.log`
- exit code: 0
- files:
  - components/game/GameClient.tsx sha256=83eb57f7aad5d2bca320b26529e0070a1c70832f6fd34441c086c93ca0d4031d bytes=48733
  - components/game/CombatHUD.tsx sha256=f565eaf7917492c9bd63f1353e7813c90482921059cbffeba10d9d4616a35d30 bytes=5259
  - components/game/MainMenu.tsx sha256=9ea385be2da614fbed56f64157939d93c207009bcc901c2aea31ee9309e9a0b8 bytes=9762
  - components/game/TouchControls.tsx sha256=10eb1d09ada2afdeabf8bceff98a1bf2e68bddc767751c49e8541a41d8897243 bytes=5767
  - components/game/control-settings.ts sha256=371fc72e81c350e376b6f7265250d6e6057e9312bb5cb93de4826f538beac2a8 bytes=17155
  - components/game/input.ts sha256=a3e58b05abaacb11fefb3feb0468885ba7b24ff4c89c89df96467f94972bd967 bytes=18426
  - components/game/kit-ui.ts sha256=68d8f3730f2f44a56d9cec040568a86f05f4883e6212d19b6522074b5e64af6c bytes=5457
  - components/game/Scene.tsx sha256=fdaa339973d0155ac450aae2a62e55b97c804ce818a28f6de70005324d3147d7 bytes=38023
  - components/game/use-game-music.ts sha256=e06d87803c553a5618ec6ac203a2a81bd046d7cd0bab73deea50f4df4cb883af bytes=1911
  - components/game/music-player.ts sha256=256fc25a35cc7288b181a1892f25a8bd4dbe5690c96738a4f3770d06efad81ce bytes=6431
  - components/game/music-settings.ts sha256=9d142b30c3959707da94b33c9a67cba2b7330925fc4b86963677499d12a7bc66 bytes=944
  - components/game/MusicControls.tsx sha256=136480dfef4386470408e920f17f22fda73d8829c10a015ed19776e34e2e651e bytes=1637
  - lib/rooms.ts sha256=39d8ee8ba46c5c39db169811e0ac732e5f9db954920511a649c6f66c45d4f3a6 bytes=18915
  - lib/room-invite.ts sha256=ce304985f836b2839a147ae553777fdaa0b3318caf4c782247a10fa5a10b1a58 bytes=1307
  - public/audio/siege-of-the-gilded-hall.mp3 sha256=78d6f749fbe14e29d06718f23e6851070de1249dc4a7e87067b8ed814c146c56 bytes=3959600

```
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
✔ depth scale and spawn punch are bounded, monotonic and off under reduced motion (0.123743ms)
✔ tilt and scale are applied per frame without adding nodes (0.635649ms)
ℹ tests 241
ℹ suites 0
ℹ pass 241
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 878.00229
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> final-terminus-protocol-xi@0.1.0 typecheck
> tsc --noEmit

[5/5] build ssr environment...
[2Ktransforming...✓ 139 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 803ms
[0m
  Route (app)
  ┌ ? /         
  └ λ /api/rooms

  λ API  ? Unknown

  ? Some routes could not be classified. vinext currently uses static analysis
    and cannot detect dynamic API usage (headers(), cookies(), etc.) at build time.
    Automatic classification will be improved in a future release.

  Build complete. Run `vinext start` to start the production server.

```

Receipt attached, awaiting seal.

## Receipt: loop 2.A

- time: 2026-10-24T05:25:16Z
- cwd: /workspace/scratch/86df643da5ef/terminus-public-release
- command: `npm test > /tmp/terminus-loop2a-tests.log && tail -10 /tmp/terminus-loop2a-tests.log && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs > /tmp/terminus-loop2a-build.log 2>&1 && tail -18 /tmp/terminus-loop2a-build.log`
- exit code: 0
- files:
  - components/game/GameClient.tsx sha256=6355f8200c076aea1210be43cd24afb83a431b74c03fbcdc59feee17bf22e031 bytes=48869
  - components/game/EncounterResult.tsx sha256=135f1e6fa5de889bf2912aecf1480cb763ee9f16c2835fd2dc2fe95cad4fddec bytes=5194
  - components/game/room-sync.ts sha256=1c9575c27928ecf02bcb787f825712786f8c6ebe169b7ff631256c8714384240 bytes=414
  - tests/room-sync.test.ts sha256=8029d61d7ce5815e3147465c6498182afc808cca018e5d6ff19e17823a052964 bytes=1180

```
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
✔ depth scale and spawn punch are bounded, monotonic and off under reduced motion (0.122401ms)
✔ tilt and scale are applied per frame without adding nodes (0.78695ms)
ℹ tests 244
ℹ suites 0
ℹ pass 244
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 897.81425
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> final-terminus-protocol-xi@0.1.0 typecheck
> tsc --noEmit

[5/5] build ssr environment...
[2Ktransforming...✓ 140 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 751ms
[0m
  Route (app)
  ┌ ? /         
  └ λ /api/rooms

  λ API  ? Unknown

  ? Some routes could not be classified. vinext currently uses static analysis
    and cannot detect dynamic API usage (headers(), cookies(), etc.) at build time.
    Automatic classification will be improved in a future release.

  Build complete. Run `vinext start` to start the production server.

```

Receipt attached, awaiting seal.

## Receipt: loop 3

- time: 2026-10-24T06:12:03Z
- cwd: /workspace/scratch/86df643da5ef/terminus-public-release
- command: `npm test > /tmp/terminus-loop3-tests.log && tail -10 /tmp/terminus-loop3-tests.log && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs > /tmp/terminus-loop3-build.log 2>&1 && tail -18 /tmp/terminus-loop3-build.log`
- exit code: 0
- files:
  - components/game/MainMenu.tsx sha256=1359fc49b015b6fef66a1fe1cfa630ebe68530603bf8ef1a8951fed64945a28b bytes=12110
  - components/game/HeroPicker.tsx sha256=2939711f721d25139a353ba0ace877cf8d3b5c2f8107dab418768daf9b965104 bytes=2917
  - components/game/main-menu.css sha256=f34dceefa94977135ea2f9e6d72cb6266d8fbe2942f8c505fdbe446d48ee75ea bytes=8641
  - components/game/hero-picker.css sha256=303b10764efada6ff578f8895c8881c51fe5d66ac0358f0eba1abb7a37a80420 bytes=3143
  - components/game/ControlsPanel.tsx sha256=ed2b2398d9cd7553257b96eff829361a5a550df955a776817096e60f4ea792f3 bytes=11423
  - components/game/controls-panel.css sha256=eaaaa41240e3ca8948018a94c7906ee1ff00edd2bbd2c7aef6b7c6ec8f4bf26f bytes=3982
  - components/game/GameClient.tsx sha256=9ee397c51043d5cdf14baffa937ea013fa158519e33af1b87379fc2aa0fe7cd8 bytes=51139
  - lib/rooms.ts sha256=8584cea70a4976104a77736c4d65b447d0e81800707dcc1141459a5e2fbd2ae3 bytes=20903
  - tests/rooms.test.ts sha256=af0bd7534e63743a57103283bc886da18faff052db94fc1bc7123cc70c0e58e3 bytes=42340
  - docs/HERO-PICKER.md sha256=cd0c0acc770628771eae21095d0243f8f04a87c4fab906a39c141b4162459b71 bytes=1531

```
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
✔ depth scale and spawn punch are bounded, monotonic and off under reduced motion (0.236579ms)
✔ tilt and scale are applied per frame without adding nodes (0.754012ms)
ℹ tests 252
ℹ suites 0
ℹ pass 252
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 954.078655
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> final-terminus-protocol-xi@0.1.0 typecheck
> tsc --noEmit

[5/5] build ssr environment...
[2Ktransforming...✓ 143 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 908ms
[0m
  Route (app)
  ┌ ? /         
  └ λ /api/rooms

  λ API  ? Unknown

  ? Some routes could not be classified. vinext currently uses static analysis
    and cannot detect dynamic API usage (headers(), cookies(), etc.) at build time.
    Automatic classification will be improved in a future release.

  Build complete. Run `vinext start` to start the production server.

```

Receipt attached, awaiting seal.
