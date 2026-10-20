# Final Terminus Protocol XI

A first playable foundation for Corey's Terminus Q Protocol: a third-person, real-time party battle built around **auto attacks → TP → weaponskills → skillchains → Magic Bursts**, with a hate (enmity) system deciding who holds the enemy's attention.

Lead one character and four trusts, or replace trust slots with other players for a party of one to five. The camera follows behind the controlled character. This milestone has a single arena, procedural articulated characters, three boss phases, a shorter trial and a sustained god encounter. Its combat rhythm draws from Final Fantasy XI; the cast and presentation use Terminus vocabulary and original procedural assets.

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

Controller labels follow a standard Xbox-style browser mapping. Press a controller button to expose it to the browser. Physical controller hardware has not been verified for this milestone.

| Action | Keyboard / mouse | Standard controller |
| --- | --- | --- |
| Move | WASD; Up/Down also move forward/back | Left stick |
| Turn character and follow camera | Drag on battlefield; Q/E or Left/Right | Right stick horizontal |
| Engage / disengage | Space | A |
| Arc Cleave / Vector Pierce / Resonance | 1 / 2 / 3 | X / Y / RB |
| Fire / Ice / Lightning | 4 / 5 / 6 | D-pad Up / Down / Left |
| Provoke | R | RT |
| Mend | F | LB |
| Guard | Left Shift | LT |
| Evade | C | B |

Buttons in the HUD also perform combat actions. Abilities follow the selected role: Bacchus, Heracles and Dolos use weaponskills; Hecate casts magic; Ariadne heals; Heracles provokes. Everyone can engage, move, guard and evade. Menus and text fields suppress gameplay input. Controller navigation of menus and controller remapping are not implemented.

## Online parties and saves

Open **Party → Create online party**, then share the 32-character invite code with people who can access the same Site. Other players use **Join party**. Creating a party starts a fresh server encounter using the selected trial/god mode; it does not upload the local save.

A room has exactly five slots. Each joined player receives a separate secret session token. Missing players become trusts after **8 seconds**; their slots remain reserved for reconnect until **45 seconds** after their last accepted sync. **Reconnect saved session** uses the session stored in that browser tab. After reservation expiry, join again to obtain an available slot. Explicitly leaving releases the slot immediately. Rooms expire **24 hours** after creation.

An owner-private Site still requires Site access. **A room invite code does not bypass the Site's access policy.** Other people cannot join an owner-only deployment just by knowing its room code.

Solo state and graphics preferences are saved in this browser's local storage. Solo state autosaves about every five seconds and on page exit, with a manual save button in Settings. It belongs to the current browser and origin, not to a cross-device account. Local play pauses while its tab is hidden. Online room state lives in D1; online session credentials use tab session storage, separate from the solo save.

## What this milestone establishes

- One combat kernel drives solo and authoritative online play, at **20 fixed simulation steps per second**.
- Online clients send intents and receive full snapshots, with the next poll scheduled **250 ms after the previous request completes**. The server advances simulation on requests, with a **one-second maximum catch-up** after idle periods. This is an HTTP polling foundation; latency and bandwidth need further tuning.
- The renderer shares geometry/materials, instances scenery, batches rigid actor parts, pools effects and caps pixel ratio. High quality enables shadows and up to 1.5× pixel ratio; Performance uses up to 1× and disables shadows. The HUD exposes FPS, draw calls and triangle counts.
- Automated tests exercise chain/burst windows, enmity, trust behavior, telegraphs, deterministic replay, complete scripted encounters, room concurrency, ownership, isolation and malformed input.

The programmed player simulation currently finishes the trial in **118.00 seconds** and the god encounter in **361.10 seconds**, across three phases. That is evidence that the loop can sustain a roughly six-minute scripted fight; it is **not a human balance study or a guaranteed play duration**. Browser gameplay, multi-device network conditions and physical controller behavior require their own verification; passing the kernel tests does not prove them.

There is no open world, progression economy, inventory, matchmaking, finished animation library or persistent account progression yet. The module boundaries are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For small, targeted changes to balance, kits, art, maps or transport, use [docs/UPGRADING.md](docs/UPGRADING.md).
