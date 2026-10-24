# LOOP_MAP — Direct controls, menu, music and 1–5 player rooms

Goal: Implement the researched direct-control design with every character ability mapped and visible, preserve transparent glass, add the supplied music with mute/volume, and provide a clear solo/host/join/lobby/encounter/results flow for 1–5 players.
Kernel: Preserve combat mechanics, run statistics, deterministic server authority, saves/custom controls, 5 party slots filled by players or trusts, and obvious Back/Close/Leave actions. Input from menus must never fire combat actions. No duplicate activation surfaces in the default HUD.
Out of scope: New animations, new combat skills, matchmaking, chat, account systems, audio effects beyond the supplied music.
Authorization: User approved the researched plan with “make it work please sanely” and explicitly requested music, menu and multiplayer rooms/invite codes. Earlier GREEN/GO and main/publication authorization remain active.

| Loop | Goal | Files it may touch | Exit check | Status |
|---|---|---|---|---|
| 2 | Ship coherent direct controls and start/room/music experience | components/game/* control/HUD/menu/music files, app/globals.css, lib/rooms.ts and room metadata/validation, app/api/rooms/route.ts if required, tests/* relevant to changed behavior, public/audio/siege-of-the-gilded-hall.mp3, docs/*, LOOP_MAP.md, RECEIPTS.md, GAUNTLET.md | npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs | mapped |

Whole-build check: the command above plus browser checks of menu → solo or room → combat → results, mapped-action discoverability and music controls. Exercise room capacity, independent client slots, reconnect and invite handling with authoritative tests. Browser/real-device limits must be explicit; never substitute a blank WebGL canvas for visual proof.

Implementation tasks may run concurrently in separate files inside this authorized loop. The owner integrates GameClient and global styles. A separate reviewer reads code and receipts before publication. Existing scoreboard loop1 receipts remain in RECEIPTS.md.
