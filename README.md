# Terminus Protocol — Logos Ascension

The supplied Zeus/Logos artwork is the opening screen. **Enter → The Q Protocol** opens the main menu outside the 3D game; Host and Join live there. The arena and hero models mount only when entering a solo run or party lobby. The title artwork is served as a 495 KB WebP at its original 1672×941 dimensions.

Solo play waits for hero loading (with scaffold fallbacks) and initial shader preparation before starting the combat clock. Online lobbies show each connected player's loading state; the server rejects a host's start until those clients are loaded. Empty places remain trusts. A disconnected loading client becomes a trust after the existing presence timeout. An already-running room continues during a late joiner's load. Older clients without the additive readiness field keep their existing behavior.

On short landscape screens the whole menu scrolls, with Play solo first and Start kept visible during hero selection. Loading offers **Use lighter 3D** (Performance graphics and basic models without GLB downloads); failed or stalled attempts offer **Retry loading** after at most 20 seconds. New touch devices default to Performance graphics. See [mobile entry verification](docs/MOBILE-ENTRY.md).

A first playable foundation for Corey's Terminus Q Protocol: a third-person, real-time party battle built around **auto attacks → TP → weaponskills → skillchains → Magic Bursts**, with a hate (enmity) system deciding who holds the enemy's attention.

Lead one character and four trusts, or replace trust slots with other players for a party of one to five. The camera follows behind the controlled character. This milestone has a single arena, five painted character models, Crown Resonance followed by the lower-arena sentinel and giant Logos sequence, a shorter trial and a sustained god mode. Its combat rhythm draws from Final Fantasy XI; the cast and presentation use Terminus vocabulary and character references.

Painted heroes are enabled by default. **Settings → Characters** also offers **Original scaffold**, which remains visible while models load and for any model that fails to load. The painted roster has idle/walk loops, code-authored combat motions, attached weapons and role-specific armor details. See [docs/CHARACTER_ASSETS.md](docs/CHARACTER_ASSETS.md) for source assets and [Stormlight presentation](docs/STORMLIGHT-PRESENTATION.md) for the cinematic shader, lightning, casting, armor, audio and performance pass.

The party is Bacchus, Heracles, Dolos, Hecate and Ariadne. Zeus made Ariadne, Bacchus, Dolos and Hecate amnesiac guardians of the **Middle Plane**; descending into the **Quantum Realm** brings their godhood forward before their memories return. Those four are the original descenders. Heracles fills the fifth active party role, with his story entrance still open.

Begin with **Crown Resonance at Crowned Horizon**. After victory, choose **Descend to Logos** (the host leads online parties). The platform descends for up to one minute with the Crown scoreboard visible. **Ready up · skip wait** begins the sentinel encounter immediately once every connected human player is ready; trusts need no vote. Defeat six awakened sentinels, then fight giant Logos through separate head and hand targets; all five divine ultimates unlock when the giant rises. Coherence loss ends in a staged floor collapse and escape. Every ultimate has its own **10-minute cooldown**. Current story decisions and open questions live in [docs/LORE.md](docs/LORE.md).

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

1. Choose **Enter the encounter**, use Space, or open **Commands → Attack**. Move within weapon range and stay engaged to auto attack. Enter/controller A opens Commands; a separate press confirms the highlighted choice.
2. At **1,000 TP**, choose a weaponskill. It spends all accumulated TP; higher TP increases its damage.
3. A **different party member** uses the matching follow-up weaponskill **1.5–8 seconds** after the opener. Dolos can earn one self-close with Split Volley.
4. Cast the matching element during the resulting **8-second Magic Burst window**. Trusts coordinate their own chains, bursts, healing and enmity management.
5. Move out of ground circles and cones, guard raid pulses, and keep the party alive through all three boss phases.

| Weaponskill pair | Skillchain | Burst element |
| --- | --- | --- |
| Arc Cleave → Vector Pierce | Fusion | Fire |
| Vector Pierce → Q Resonance | Distortion | Ice |
| Q Resonance → Arc Cleave | Fragmentation | Lightning |

Damage and healing generate enmity. Provoke adds a large temporary spike; volatile enmity decays while cumulative enmity persists until reduced by combat. The party panel shows relative threat and the current target.

Party selections choose a friendly Mend target. To change characters in solo play, open **Party → Take control**; the previous character becomes a trust. **Settings** lets you prepare a fresh trial or god encounter, pause local simulation, save, select performance graphics or enable character wireframes. Online play assigns each player one slot.

The god encounter has a **7:30 combat deadline**. Coherence Collapse warns at 30 seconds remaining and begins its final cast at 10 seconds. Defeat Crown Resonance before it completes; the collapse cannot be guarded or evaded. Preparation time does not consume this deadline.

## Controls

Open **Settings → Controls & camera** to remap keyboard keys and controller buttons, adjust sensitivity, camera distance/height/shoulder offset, or enable optional inversion. All inversion starts **off**. Changes save on this browser/origin and the HUD shows your current bindings. Restore defaults is available in the same panel.

| Action | Default keyboard / mouse | Standard controller |
| --- | --- | --- |
| Move relative to camera | WASD | Left stick |
| Orbit and pitch camera | Drag battlefield; I / J / K / L | Right stick horizontal and vertical |
| Zoom | Mouse wheel; Page Up / Page Down | Assign buttons in Controls & camera |
| Recenter behind character | V | Right-stick click |
| Cycle enemy target | Left / Right arrows; Tab / Shift + Tab | D-pad Left / Right; left-stick click |
| Cycle friendly Mend target | Up / Down arrows | D-pad Up / Down |
| Open Commands | Enter | A |
| Navigate Commands | Arrow keys | D-pad |
| Select / back in Commands | Enter / Escape | A / B |
| Engage / disengage | Space; Commands → Attack / Disengage | Commands → Attack / Disengage |
| Role primary actions | 1 / 2 / 3 | X / Y / RB |
| Fire / Ice / Thunder | Hecate primaries; 4 / 5 / 6 | Hecate: X / Y / RB |
| Critical Dash / Split Volley / Rapid Weave / Aegis | Z / X / E / T | Commands; remappable |
| Revelry | Q | Commands; remappable |
| Provoke | R | RT |
| Mend | F | LB |
| Guard | Left Shift (release) | LT |
| Evade | C | B |

While disengaged, the camera can orbit independently while standing still. Engagement locks the view toward the living enemy; zoom remains available. Mouse-right looks right; mouse-up looks up. The same default convention applies to the right stick. Camera height adjusts the vertical anchor, shoulder offset shifts the view sideways, and distance controls depth/zoom. Movement uses the camera's forward/right basis. Recenter restores the view behind the character while preserving zoom.

Tab selects/cycles the available enemy; every press pulses its world-space marker. This is enemy selection, separate from the boss's enmity target. Crown Resonance is a single target; the lower arena has six sentinels followed by Logos's head and two hands.

Click a key binding and press a replacement; Escape cancels. Conflicts swap the previous key/button where possible or clear the displaced binding. Ctrl/Meta/Alt/browser shortcuts remain reserved. Modifier-only combat keys activate on release so Shift + Tab does not also trigger Guard. Menus preserve normal Tab navigation and suppress gameplay; wheel zoom applies only on the battlefield. Lost focus clears held input.

Controller labels use the standard Xbox-style browser mapping. Press a controller button to expose it to the browser. Physical hardware remains unverified. Left/right stick axes are fixed, while action buttons and their inversion/sensitivity settings are configurable. Within Commands, arrows/D-pad navigate, Enter/A selects, and Escape/B goes back; these navigation controls are fixed. Settings dialogs retain normal keyboard and Tab navigation. The menu opener is remappable; untouched older defaults migrate to the current directional targeting and role-primary layout. Custom mappings stay intact, with a notice for newly unbound commands.

The compact console keeps resources and Revelry visible; **Show quick actions** expands the hotbar. Commands has Attack, Spells → Allies / Adversaries, Abilities, Weapon Abilities, Items and Disengage. Available actions follow the controlled role. Mend automatically chooses the lowest HP percentage in range, or honors the selected friendly target. A successful manual Mend returns targeting to Auto; rejected targets remain selected. Items is explicitly unavailable until inventory exists. Combat continues while choosing; movement, camera and combat shortcuts are suppressed while Commands owns input.

World feedback shows damage and healing at their targets, with separate chain/burst labels. Ground markers distinguish role and selection; gold TP cues apply to living weapon users, while low HP has a steady warning. Feedback pools are bounded, and reduced-motion preferences suppress number lift and decorative expansion. See [docs/QOL-PORT.md](docs/QOL-PORT.md).

Buttons in the HUD also perform combat actions. Bacchus, Heracles and Dolos use weaponskills; Hecate casts magic; Ariadne heals; Heracles provokes. Everyone can engage, move, guard and evade.

## Character mechanics

Every activated ability has an individual cooldown. After the six sentinels fall and giant Logos rises, **G** on keyboard or **L3** on a fresh controller layout uses your ultimate; touch has an ultimate button. Existing custom bindings remain intact; Controls shows a notice if an older controller map needs an Ultimate binding. Heracles’s primary slots become Lightning Shock / Bolt / Clap during Son of Zeus. Ordinary physical criticals deal 1.5× damage; extra auto hits cannot recursively trigger themselves.

| Character | Secondary traits and technique |
| --- | --- |
| Bacchus | 10% crit, 15% extra half-strength auto hit. Critical Dash: three guaranteed 2× hits, TP per hit, return to start; 45s recast. Revelry remains available. |
| Heracles | 5% crit, 10% extra auto hit, +30% enmity, 10% physical damage reduction. |
| Dolos | 15% crit, +25% outgoing TP. Split Volley: five arrows, 1,250 TP total, one self-chain permission for 8s; 45s recast. |
| Hecate | Three distinct spells within 12s refund 140 MP; +10% matching burst damage. Fire/Ice/Thunder each have 6s recasts and 2s normal spell recovery. Rapid Weave permits two rapid casts per element with 0.5s recovery, for 12s; 180s recast. |
| Ariadne | +20% healing below 35% HP; 25% less healing enmity. Luminous Aegis grants each living ally within 18 units one hit of invulnerability; 120 MP, 90s recast. |

### Divine awakening against Logos

| Hero | Ultimate · 600 second recast |
| --- | --- |
| Hecate | **Fission:** a visible atom splits; 9,000 Matk-scaled area damage within 12m of the boss. |
| Dolos | **Rain of Fire:** all enemies in that 12m area take a guaranteed 3× physical critical (2,000 × 3 before attack bonuses). Each survivor burns for exactly 25% of its actual impact damage, paid over three one-second ticks. |
| Ariadne | **Rejuvenator:** all living allies receive full HP and 3,000 TP globally. Each gets a damage shield equal to 25% of HP actually restored; fallen allies are not revived. Aegis remains a separate one-hit ward. |
| Bacchus | **Fearless:** five guaranteed critical hits for each living ally; ten for Bacchus. Each of his empowered hits refills TP to 3,000. Compatible self-chains open **Dusk** for 10 seconds, allowing any elemental spell/shot and Bolt to Magic Burst. Charges last until used or the actor falls. |
| Heracles | **Thunderclap:** interrupts and stuns all enemies, including Logos, for 5 seconds. **Son of Zeus** doubles his visual scale and forces all enemies to target him while alive. The form has no timer. Lightning Shock chains between enemies within 8m, stunning for 2 seconds (45 MP, 12s recast); Bolt deals Matk damage and can burst (70 MP, 6s recast); Clap spends all TP, at least 1,000, to deal area magic damage and stun for 3 seconds (12s recast). |

See [Logos encounter](docs/LOGOS-ENCOUNTER.md) for the Figma art, descent, sentinel rush, hand/head targeting and collapse. The new combat state is authoritative in solo and rooms and survives saving/reconnect. See [divine awakening verification](docs/DIVINE-AWAKENING.md) for exact tests, provisional balance values and visual-review limits.

Regent's Decree marks one ally in phases 2–3. Terminal Echo adds two raid pulses a second apart in phase 3; a single shield charge blocks only the first eligible hit. Collapse still defeats the party at the deadline.

The approved map and evidence are in [mechanics UKSL](docs/mechanics-uksl.md) and [mechanics verification](docs/MECHANICS-VERIFICATION.md). Character animation work is owned separately by Claude.

## Online parties and saves

Open **The Q Protocol → Host a party** from the start menu, then share the 32-character invite code with people who can access the same Site. Other players use **Join a party** there. The in-game waiting menu has no Host or Join entries. Creating a party prepares a fresh server lobby using the selected trial/god mode; it does not upload the local save. The host starts after connected clients finish loading.

A room has exactly five slots. Each joined player receives a separate secret session token. Missing players become trusts after **8 seconds**; their slots remain reserved for reconnect until **45 seconds** after their last accepted sync. **Reconnect saved session** uses the session stored in that browser tab. After reservation expiry, join again to obtain an available slot. Explicitly leaving releases the slot immediately. Rooms expire **24 hours** after creation.

An owner-private Site still requires Site access. **A room invite code does not bypass the Site's access policy.** Other people cannot join an owner-only deployment just by knowing its room code.

Solo state and graphics preferences are saved in this browser's local storage. Solo state autosaves about every five seconds and on page exit, with a manual save button in Settings. It belongs to the current browser and origin, not to a cross-device account. Local play pauses while its tab is hidden. Online room state lives in D1; online session credentials use tab session storage, separate from the solo save.

## What this milestone establishes

- One combat kernel drives solo and authoritative online play, at **20 fixed simulation steps per second**.
- Online clients send intents and receive full snapshots, with the next poll scheduled **250 ms after the previous request completes**. The server advances simulation on requests, with a **one-second maximum catch-up** after idle periods. This is an HTTP polling foundation; latency and bandwidth need further tuning.
- The renderer batches platform details and procedural parts, pools effects, skips hidden skeletons and caps pixel ratio. Painted heroes use cached GLBs, shared geometry/textures and independent skeletons, mixers and mutable materials; the scaffold remains available. The five asset files total **21,204,844 bytes and 124,998 triangles** before scene/render passes. These are asset measurements, not a performance benchmark. High quality enables shadows and up to 1.5× pixel ratio; Performance uses up to 1× and disables shadows. The HUD exposes FPS, draw calls and triangle counts.
- Automated tests exercise chain/burst windows, enmity, trust behavior, telegraphs, deterministic replay, complete scripted encounters, room concurrency, ownership, isolation and malformed input.

The fixed-seed active input simulations for all five controlled roles finish trial in **108–115 seconds** and god in **320–330 seconds**, with all five party members alive. Reproduce them with `node --experimental-strip-types scripts/verify-mechanics-encounters.mjs`. The idle-leader god scenario loses at the **450-second** collapse deadline. That is evidence that the loop can sustain a roughly six-minute scripted fight and requires participation under those test policies; it is **not a human balance study or a guaranteed play duration**. Browser gameplay, multi-device network conditions and physical controller behavior require their own verification; passing the kernel tests does not prove them.

There is no open world, progression economy, inventory, matchmaking, finished animation library or persistent account progression yet. Ultimate unlocks belong to the saved expedition; a fresh expedition begins at Crown Resonance. The module boundaries are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For small, targeted changes to balance, kits, art, maps or transport, use [docs/UPGRADING.md](docs/UPGRADING.md).
