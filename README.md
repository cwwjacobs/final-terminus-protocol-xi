# Final Terminus Protocol XI

A first playable foundation for Corey's Terminus Q Protocol: a third-person, real-time party battle built around **auto attacks → TP → weaponskills → skillchains → Magic Bursts**, with a hate (enmity) system deciding who holds the enemy's attention.

Lead one character and four trusts, or replace trust slots with other players for a party of one to five. The camera follows behind the controlled character. This milestone has a single arena, five painted character models, a procedural boss with three phases, a shorter trial and a sustained god encounter. Its combat rhythm draws from Final Fantasy XI; the cast and presentation use Terminus vocabulary and character references.

Painted heroes are enabled by default. **Settings → Characters** also offers **Original scaffold**, which remains visible while models load and for any model that fails to load. The painted roster has idle and walk loops; authored weapon props and combat clips are not included yet. See [docs/CHARACTER_ASSETS.md](docs/CHARACTER_ASSETS.md) for the copied assets, verification scope and upgrade path.

The party is Bacchus, Heracles, Dolos, Hecate and Ariadne. Zeus made Ariadne, Bacchus, Dolos and Hecate amnesiac guardians of the **Middle Plane**; descending into the **Quantum Realm** brings their godhood forward before their memories return. Those four are the original descenders. Heracles fills the fifth active party role, with his story entrance still open.

The encounter is **Crown Resonance at Crowned Horizon**, adapted from the Episode 1 treatment. It replaces the prototype name Hollow Regent and is not Logos himself. Local victory does not settle the fate of Logos or the beings his world sustains. Current story decisions and open questions live in [docs/LORE.md](docs/LORE.md).

## Run locally

Use Node.js 22.13 or newer and a browser with WebGL. From this directory:

```sh
npm install
npm test
npm run typecheck
npm run build
```

Local solo play does not require a database. For local multiplayer, apply the included migration after the build has generated `dist/server/wrangler.json`:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_absent_silver_sable.sql
```

Apply that migration once to a fresh local database. For later schema changes, use `npm run db:generate`, then apply only the new migrations in order. `.wrangler/state` is shared by development and built previews; do not add `/v3` to the path. This command modifies the local preview database only.

Start development:

```sh
npm run dev
```

Open the URL printed by the server. For a local preview of the built Worker, use `npm start`. Neither command publishes the Site. When working through the Sites plugin, use its prescribed preview/build/publish workflow; the commands here are for standalone development.

## Play the loop

1. Choose **Enter the encounter**, or engage with Space/controller A. Move within weapon range and stay engaged to auto attack.
2. At **1,000 TP**, choose a weaponskill. It spends all accumulated TP; higher TP increases its damage.
3. A **different party member** uses the matching follow-up weaponskill **1.5–8 seconds** after the opener.
4. Cast the matching element during the resulting **8-second Magic Burst window**. Trusts coordinate their own chains, bursts, healing and enmity management.
5. Move out of ground circles and cones, guard raid pulses, and keep the party alive through all three boss phases.

| Weaponskill pair | Skillchain | Burst element |
| --- | --- | --- |
| Arc Cleave → Vector Pierce | Fusion | Fire |
| Vector Pierce → Q Resonance | Distortion | Ice |
| Q Resonance → Arc Cleave | Fragmentation | Lightning |

Damage and healing generate enmity. Provoke adds a large temporary spike; volatile enmity decays while cumulative enmity persists until reduced by combat. The party panel shows relative threat and the current target.

In solo play, click any party member to control their role; the previous character becomes a trust. **Settings** lets you prepare a fresh trial or god encounter, pause local simulation, save, select performance graphics or enable character wireframes. Online play assigns each player one slot.

The god encounter has a **7:30 combat deadline**. Coherence Collapse warns at 30 seconds remaining and begins its final cast at 10 seconds. Defeat Crown Resonance before it completes; the collapse cannot be guarded or evaded. Preparation time does not consume this deadline.

## Controls

Open **Settings → Controls & camera** to remap keyboard keys and controller buttons, adjust sensitivity, camera distance/height/shoulder offset, or enable optional inversion. All inversion starts **off**. Changes save on this browser/origin and the HUD shows your current bindings. Restore defaults is available in the same panel.

| Action | Default keyboard / mouse | Standard controller |
| --- | --- | --- |
| Move relative to camera | WASD | Left stick |
| Orbit and pitch camera | Drag battlefield; arrow keys | Right stick horizontal and vertical |
| Zoom | Mouse wheel; Page Up / Page Down | Assign buttons in Controls & camera |
| Recenter behind character | V | Right-stick click |
| Cycle enemy target | Tab; Shift + Tab reverses | Left-stick click |
| Engage / disengage | Space | A |
| Arc Cleave / Vector Pierce / Resonance | 1 / 2 / 3 | X / Y / RB |
| Fire / Ice / Lightning | 4 / 5 / 6 | D-pad Up / Down / Left |
| Provoke | R | RT |
| Mend | F | LB |
| Guard | Left Shift (release) | LT |
| Evade | C | B |

The camera can orbit independently while standing still. Mouse-right looks right; mouse-up looks up. The same default convention applies to the right stick. Camera height adjusts the vertical anchor, shoulder offset shifts the view sideways, and distance controls depth/zoom. Movement uses the camera's forward/right basis; moving right no longer moves left on screen. Recenter restores the view behind the character while preserving zoom.

Tab always selects/cycles the available enemy, including when Crown Resonance is the only target; every press pulses its world-space marker. This is enemy selection, separate from the boss's enmity target. Starting an attack also selects the current boss automatically. This encounter still contains one enemy; cycling supports a target list for future encounters without inventing additional enemies now.

Click a key binding and press a replacement; Escape cancels. Conflicts swap the previous key/button where possible or clear the displaced binding. Ctrl/Meta/Alt/browser shortcuts remain reserved. Modifier-only combat keys activate on release so Shift + Tab does not also trigger Guard. Menus preserve normal Tab navigation and suppress gameplay; wheel zoom applies only on the battlefield. Lost focus clears held input.

Controller labels use the standard Xbox-style browser mapping. Press a controller button to expose it to the browser. Physical hardware remains unverified. Left/right stick axes are fixed, while action buttons and their inversion/sensitivity settings are configurable. Controller menu navigation is not implemented.

Buttons in the HUD also perform combat actions. Bacchus, Heracles and Dolos use weaponskills; Hecate casts magic; Ariadne heals; Heracles provokes. Everyone can engage, move, guard and evade.

## Online parties and saves

Open **Party → Create online party**, then share the 32-character invite code with people who can access the same Site. Other players use **Join party**. Creating a party starts a fresh server encounter using the selected trial/god mode; it does not upload the local save.

A room has exactly five slots. Each joined player receives a separate secret session token. Missing players become trusts after **8 seconds**; their slots remain reserved for reconnect until **45 seconds** after their last accepted sync. **Reconnect saved session** uses the session stored in that browser tab. After reservation expiry, join again to obtain an available slot. Explicitly leaving releases the slot immediately. Rooms expire **24 hours** after creation.

An owner-private Site still requires Site access. **A room invite code does not bypass the Site's access policy.** Other people cannot join an owner-only deployment just by knowing its room code.

Solo state and graphics preferences are saved in this browser's local storage. Solo state autosaves about every five seconds and on page exit, with a manual save button in Settings. It belongs to the current browser and origin, not to a cross-device account. Local play pauses while its tab is hidden. Online room state lives in D1; online session credentials use tab session storage, separate from the solo save.

## What this milestone establishes

- One combat kernel drives solo and authoritative online play, at **20 fixed simulation steps per second**.
- Online clients send intents and receive full snapshots, with the next poll scheduled **250 ms after the previous request completes**. The server advances simulation on requests, with a **one-second maximum catch-up** after idle periods. This is an HTTP polling foundation; latency and bandwidth need further tuning.
- The renderer instances scenery, batches procedural parts, pools effects and caps pixel ratio. Painted heroes use cached GLBs, shared geometry/textures and independent skeletons, mixers and mutable materials; the scaffold remains available. The five asset files total **21,204,844 bytes and 124,998 triangles** before scene/render passes. These are asset measurements, not a performance benchmark. High quality enables shadows and up to 1.5× pixel ratio; Performance uses up to 1× and disables shadows. The HUD exposes FPS, draw calls and triangle counts.
- Automated tests exercise chain/burst windows, enmity, trust behavior, telegraphs, deterministic replay, complete scripted encounters, room concurrency, ownership, isolation and malformed input.

The active programmed player simulation currently finishes the trial in **116.50 seconds** and the god encounter in **363.85 seconds**, across three phases. The idle-leader god scenario loses at the **450-second** collapse deadline. That is evidence that the loop can sustain a roughly six-minute scripted fight and requires participation under those test policies; it is **not a human balance study or a guaranteed play duration**. Browser gameplay, multi-device network conditions and physical controller behavior require their own verification; passing the kernel tests does not prove them.

There is no open world, progression economy, inventory, matchmaking, finished animation library or persistent account progression yet. The module boundaries are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For small, targeted changes to balance, kits, art, maps or transport, use [docs/UPGRADING.md](docs/UPGRADING.md).
