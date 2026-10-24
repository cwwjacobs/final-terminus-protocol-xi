# U-KSL — Finishing the mechanics listed here

Final Terminus Protocol XI · approved mechanics map · revision 0.2 · October 24, 2026

Status: BUILD authorized by the Operator: ‘you are GREEN for GO you may BUILD’. Mechanics implementation and automated checks are complete; see [the verification receipt](MECHANICS-VERIFICATION.md) for evidence, tuning and remaining visual/hardware acceptance limits. Proposed defaults below are adopted for this build unless an explicit tuning receipt records an amendment. Completion and Ultra Stage 3 acceptance require evidence; authorization does not imply PASS.

## 1. Ultra: the intended whole

Finish the requested character traits, extra hits, individual ability and spell cooldowns, Hecate's rotation and rapid refresh, Ariadne's party shield and healing targeting, Dolos's TP-building self-chain tool, Bacchus's three-hit critical dash, boss mechanics, and directional target controls. These must compose into a playable encounter in solo/trust and online play, across keyboard, controller, and touch.

This handoff follows the hierarchy and stage discipline of [Terminus Protocol, U-KSL Core Canon v0.5](https://terminusprotocol.io/). Ultra owns the overall objective and constraints; Intra contains the bounded KSL work; Infra is the resulting game. Each KSL separately defines, implements, and verifies its work. A defect is mapped at its owning Stage 1 before correction. The final Ultra assessment evaluates the integrated encounter; passing individual KSLs is insufficient. Valid earlier evidence is retained. The Operator decides whether the verified outcome is sufficient.

The mechanics below are the Ultra requirements and proposed balance contract. They are not complete implementation maps for every future KSL. Each local map is completed when its dependencies are ready.

### Decision labels

- **R — requested:** directly follows the Operator's request. Preserve it unless the Operator amends it.
- **P — proposed default adopted at BUILD:** a concrete value that fills an unspecified detail. Its implementation and balance still require verification.
- **E — existing:** observed in the source baseline. Preserve or deliberately amend it as identified below.

BUILD for this mapped revision may adopt its proposed defaults together; do not demand a separate approval for every tuning value. Surface a consequential departure from the map before implementing it.

### Kernel: what must remain true

1. Combat outcomes belong to the authoritative simulation. Clients submit permitted intents, not damage, TP awards, critical results, shield charges, cooldown resets, or dash destinations.
2. Identical initial state, seed, and accepted intent sequence produce identical results across elapsed-time partitions and save/reconnect boundaries. Rendering must not decide hit timing.
3. Character ownership, role permissions, HP/MP/TP bounds, room authentication, and replay protection remain enforced. An invalid request spends nothing and advances no random state.
4. Bacchus remains the enhancer; Heracles the tank; Dolos the ranged elemental hunter; Hecate the elemental mage; Ariadne the light healer. Additional traits must affect gameplay, not merely add labels.
5. Existing Revelry retains its rule: one stack per living ally per cast, up to five, +5 Patk and +5 Matk per stack; actual incoming damage clears only the damaged recipient's stacks. It does not increase healing. Fully prevented damage does not remove stacks.
6. The trial remains forgiving. The god encounter retains its 450-second collapse deadline and requires active contribution. New protection does not negate the terminal collapse.
7. Combat state, availability indicators, target cues, animations, and hit feedback must agree. Keep the enemy bar near the top and enemy chain/burst marks on the enemy. Preserve the compact mobile layout.
8. Prior code and tests are evidence, not untouchable requirements: intentionally replace the blanket self-chain prohibition with the narrow Dolos exception, and migrate shared cooldowns and changed input defaults explicitly.

### Scope boundary

Included: mechanics and their necessary engine, trust AI, validation, persistence, controls, feedback, and encounter tuning changes. Existing models may receive the presentation needed to communicate these actions.

Excluded: new characters, equipment or progression systems, loot/inventory, additional bosses or adds, PvP, new commercial assets, networking replacement, full animation production, and broad site redesign. Those need a separate scope decision.

### Operator amendment — animation ownership

During BUILD the Operator assigned character animations to Claude: “I've got claude working on animations so don't worry about those”. This build owns authoritative movement/hit timing, cooldowns, target selection, state persistence, and compact HUD/state indicators. It leaves character rigs, clips, and animation production to that parallel work. Sequence events expose stable IDs and actual hit outcomes for the animation consumer. Actual 3D animation acceptance remains an explicit handoff; mechanics evidence does not claim it passed.

## 2. Evidence: the game that exists now

Inspected baseline: [GitHub main, 4dc06e146641b477146afcb28dfcf389915889b3](https://github.com/cwwjacobs/final-terminus-protocol-xi/commit/4dc06e146641b477146afcb28dfcf389915889b3). The remote was refreshed before inspection. These are source findings; the new features below have not been built or playtested.

| Area | Observed implementation | Consequence for this work |
|---|---|---|
| Character stats | Roles already have auto-attack damage, delay, TP gain, range, Patk, and Matk. Base Patk/Matk are 100; Revelry adds to both. | Extend existing role definitions with functional secondary traits. |
| Healing | Restore/Mend selects the living, wounded ally with the lowest **HP percentage** within 18 units; ties use party order. It restores up to 690 HP, costs 70 MP, and has a 5-second cooldown. | Preserve automatic triage. Add an explicit manual-target path. Healing power is not currently a separate scaling stat. |
| Defense | Guard reduces damage by 65% for 5 seconds, on a 14-second cooldown. Evade provides 0.65 seconds of evasion, on a 4-second cooldown. | Ariadne's requested one-hit shield is a new effect; it is not already an AoE shield. |
| Weaponskills | Cleave, Pierce, and Resonance spend all accumulated TP, minimum 1,000; TP caps at 3,000. They share a 2-second `weapon` cooldown. | Give each weaponskill an independent key while preserving TP spending. |
| Skillchains | A compatible closer must be a different actor and land 1.5–8 seconds after the opener. Three recipes create Fire/Ice/Lightning burst windows. | TP alone cannot make Dolos self-chain. Change eligibility as well as TP generation. |
| Magic | Fire/Ice/Lightning resolve immediately, cost 70 MP, and share a 7-second `magic` cooldown. Ordinary damage is 250; matching burst damage is 1,020 before attack scaling. | Add independent spell recasts and a deliberate rotation. No existing cast-time system needs to be invented for this scope. |
| Hecate trust | Prefers a matching burst; otherwise uses Lightning when no chain is open and MP exceeds 200. | This is not a Fire → Ice → Thunder rotation. Replace the filler policy and retain burst awareness. |
| Extra hits and crits | The inspected damage path has neither a critical-hit resolver nor an extra-hit trait resolver. | Add explicit authoritative rules and deterministic rolls. |
| Boss | Crown Strike, Null Impact (circle), Crown Sever (cone), Terminal Pulse (raid), HP-based phases, and god-mode Coherence Collapse exist. | Build on this kit rather than replacing it with a supposedly new basic boss. |
| Target controls | Arrows currently move the camera. D-pad Up/Down/Left cast Fire/Ice/Lightning; Right uses Revelry. Tab/Shift+Tab cycle the enemy. Party clicking changes the locally controlled character. | Directional target selection is a real input migration and must remain distinct from character possession. |
| Runtime | The shared simulation steps at 20 Hz. Room requests validate bounded action shapes and reject duplicate sequence numbers. Saves contain cooldowns and combat state. | New hit timelines, charges, and cooldown identities must survive both local saves and room snapshots. |

Primary code anchors: `game/content.ts`, `game/types.ts`, `game/engine.ts`, `components/game/control-settings.ts`, `components/game/input.ts`, `components/game/targeting.ts`, `components/game/command-menu.ts`, `components/game/GameClient.tsx`, `lib/local-save.ts`, `lib/state-migrations.ts`, and `lib/rooms.ts`.

Relevant existing tests cover lowest-health healing, two-actor chains, rejection of same-actor chains, burst matching, telegraph resolution, deterministic stepping, trust encounters, input context isolation, save validation, and duplicate room requests. The prior baseline passed 148 tests; that historical result does not verify this proposed design.

## 3. Shared mechanics contract

### Individual recasts, separate from input recovery

**R:** Every activated combat ability and every elemental spell has its own cooldown. Casting Fire must not put Ice and Thunder on Fire's recast. The same applies to individual weaponskills and character abilities.

**P:** Retain the current action envelope where practical and derive a stable ability key, such as `weapon:cleave`, `magic:fire`, `heal`, `revelry`, `critical-dash`, or `split-volley`. Define costs, recasts, targeting, hit behavior, and role eligibility once and consume those definitions in engine validation, trusts, command menus, and touch/desktop displays.

Brief recovery is a separate rule. It controls action cadence and animation overlap; it must never replace individual cooldowns. Proposed defaults:

| Activated action | Individual cooldown | Additional rule |
|---|---:|---|
| Arc Cleave / Vector Pierce / Q Resonance | 2s **each** | Keep all-TP spending; 0.5s offensive recovery; existing 1.5s minimum chain delay remains. |
| Fire / Ice / Thunder | 6s **each** | Immediate resolution as today; 2s spell recovery normally, 0.5s during Rapid Weave. |
| Revelry / Provoke / Mend / Guard / Evade | 45 / 18 / 5 / 14 / 4s | Preserve existing individual recasts and costs unless explicitly amended here. |
| Bacchus: Critical Dash | 45s | Three scheduled strikes and return; no simultaneous second attack sequence. |
| Dolos: Split Volley | 45s | Five scheduled arrows; no simultaneous second attack sequence. |
| Hecate: Rapid Weave | 180s | A bounded rapid-cast opportunity, described below. |
| Ariadne: Luminous Aegis | 90s | One protection charge per eligible recipient. |

Movement, target selection, camera movement, opening menus, and Engage are controls, not combat abilities requiring recasts. Auto-attacks retain attack timers. Defensive actions must remain usable during ordinary spell recovery; an active movement sequence needs the explicit interruption rule below.

Cooldowns and costs begin on successful activation. Rejected actions do not change them. Killing a target partway through a sequence does not refund the activation; only landed hits receive hit-dependent awards. Positive cooldowns advance on simulation time, not browser timers. New cooldowns continue counting down for fallen characters while the encounter runs; death must not refresh a long cooldown.

### Hits, criticals, and TP

**R/P:** Add extra melee hits; use **1.5× for ordinary physical criticals** and **2× for each guaranteed Critical Dash hit**. The ordinary multiplier is the recommended resolution of the Operator's tentative value.

- Roll crits per eligible physical hit using saved, seeded simulation state. Magic, healing, and skillchain bonus damage do not receive physical criticals in this scope.
- A guaranteed 2× dash critical replaces the normal crit multiplier. It is never 2× multiplied by 1.5×.
- Extra-hit traits apply to ordinary auto-attack rounds only. Their bonus hit cannot trigger another bonus hit. Scheduled volley/dash hits and weaponskills do not trigger these traits.
- **P:** A bonus auto hit deals 50% of that actor's ordinary auto base damage and grants 50% of ordinary auto TP before Store TP. It may independently crit. One auto round produces at most one such bonus hit.
- Store TP modifies eligible outgoing-hit TP, including explicitly defined volley TP. It does not multiply damage-taken TP or grant TP for prevented, invalid, cancelled, or post-death hits.
- Apply attack scaling and the applicable critical multiplier once, round at the final damage boundary, and cap actual damage at remaining target HP. Derive threat from actual damage/healing; apply the character's threat modifier once.
- Each scheduled hit carries a stable sequence/hit identity. Save/load, duplicate network packets, or repeated animation callbacks cannot replay it.

## 4. Character subtraits and kits

All new names and numbers in this section are **P**, except the specifically marked requested behavior. They are an initial tuning set, not a claim that the encounter is already balanced.

| Character | Secondary traits | Observable purpose |
|---|---|---|
| Bacchus | 10% ordinary physical crit chance; 15% chance of one bonus auto hit | More frequent melee impact and TP generation alongside Revelry. |
| Heracles | 5% ordinary physical crit chance; 10% bonus-auto-hit chance; +30% generated enmity; 10% physical damage reduction | A sturdier tank whose hits still matter. Physical reduction multiplies remaining damage after Guard; it is not invulnerability. |
| Dolos | 15% ordinary physical crit chance; +25% Store TP; conditional self-chain permission from Split Volley | A ranged hunter who can prepare his own chain without removing the party's ability to chain together. |
| Hecate | Elemental Cycle returns 140 MP after three consecutive distinct elemental spell successes within 12s; +10% matching Magic Burst damage | Rewards changing elements, supports a sustainable normal rotation, and preserves burst specialization. |
| Ariadne | Triage gives +20% Mend potency when the chosen ally starts below 35% HP; −25% healing-generated enmity | Stronger emergency healing with less tank competition. |

The completed Hecate set consumes its progress; it cannot pay out twice. A repeated element restarts progress with that element. A failed spell changes nothing; an expired sequence resets. Refunds cap at max MP and never come from hitting an invalid/dead target. Normal preferred order is Fire → Ice → Thunder; any three distinct elements qualify so a required burst can take priority.

**P:** Introduce a neutral healing-power baseline of 100 for Mend's formula: existing 690 base × healing power / 100 × applicable Triage modifier, capped at missing HP. At 100 with no Triage, Mend stays 690. Patk, Matk, and Revelry must not accidentally scale healing. This is a normalization of the existing heal, not an equipment/progression system.

### Bacchus — Critical Dash

**R:** Dash three times, critically hit on each strike at 2× damage, gain TP, and return to the activation location. Revelry remains a separate ability.

**P contract:**

- Requires a living enemy within Bacchus's existing melee ability range at activation. Store the authoritative starting position and selected enemy identity.
- Deliver three visible strikes at 0.2s, 0.6s, and 1.0s; return by 1.2s. Each uses one normal Bacchus auto base of 112 before Patk scaling, with the guaranteed 2× multiplier, and grants 240 TP if it lands. Three successful hits give 720 TP, subject to the 3,000 cap.
- The simulation owns positions and hit times. Rendering interpolates those positions; the effect cannot be three numbers over an unmoving character.
- Auto-attacks and other offensive sequences are suspended during the dash. This ability does not itself open or close a skillchain and does not grant invulnerability.
- Target death or cancellation stops remaining hits. A surviving Bacchus returns to the stored origin, bounded to legal arena space. His death cancels the return and must not teleport or revive him.
- Evade can cancel the remaining sequence: restore the surviving actor to the legal origin, then resolve the ordinary Evade movement. Do not award cancelled-hit TP or restart the dash on reconnect. Ordinary movement during the sequence cannot move the stored origin.

### Dolos — Split Volley and the self-chain exception

**R:** A multi-hit ability grants enough TP to let Dolos self-skillchain.

**P contract:**

- Five arrows across 1.0s, at Dolos's existing 13-unit range. Each arrow deals 40% of his 120 auto base before Patk/crit scaling.
- Pause ordinary auto-attacks during the volley and resume the retained attack timer afterward. Auto-attacks must not silently add an unaccounted sixth hit to the sequence.
- Each landed arrow grants 200 base TP; Dolos's +25% Store TP makes this 250. All five landed arrows grant **1,250 TP**. Overkill, missed remaining arrows, and TP caps cannot produce extra awards.
- Volley is a TP-building ability, not a weaponskill. It must not overwrite an active chain opener.
- The first landed volley arrow grants a single self-chain permission lasting 8s. A compatible Dolos weaponskill may close his own opener while that permission is active, provided the original 1.5–8s chain timing and 1,000-TP requirement are satisfied. A successful self-close consumes the permission.
- All other characters retain the different-actor closer requirement. Dolos without this permission also retains it. Another actor may still close Dolos's chain normally.
- Required demonstration: Dolos opens **Pierce**, uses **Split Volley**, waits until the existing minimum chain time, then closes **Resonance** to produce **Distortion → Ice**. Start the volley portion at zero TP; do not fake success by preloading 3,000 TP.
- Trust Dolos prioritizes a valid party-chain close; otherwise, when he can fund the opener and Volley is ready, he may execute this self-chain sequence. He must not spend the closing TP on an unrelated opener or endlessly replace the same chain.

### Hecate — rotation and Rapid Weave

**R:** Each spell has its own cooldown. Hecate needs a rotation and an approximately three-minute ability that enables Fire → Ice → Thunder → Fire → Ice → Thunder with instant or 0.5-second refresh behavior.

**P normal loop:** Fire at 0s, Ice at 2s, Thunder at 4s, Fire at 6s, and so on, using the per-spell 6s recasts and 2s spell recovery. Preserve 70 MP per spell and existing base damage initially. Elemental Cycle supplies the stated MP return. Matching an open burst window takes priority over filler order when that spell is available.

**P Rapid Weave:**

- 180s cooldown, no MP activation cost, 12s maximum window.
- Opens **two rapid casts per element**, six total. Eligible rapid casts can bypass that spell's ordinary remaining recast; their own refresh and shared spell recovery are 0.5s. Spells remain instantaneous, as in the existing engine.
- Activation clears Hecate's residual spell-recovery gate so the first rapid cast can start immediately. It does not erase the stored ordinary spell cooldowns; the rapid charges provide the bounded bypass.
- This makes the requested six-spell sequence possible at 0, 0.5, 1.0, 1.5, 2.0, and 2.5 seconds after activation, subject to actual resources and valid targets. It also permits tactical ordering; it does not auto-play the sequence for a human.
- Every accepted spell still costs MP, starts its ordinary 6s cooldown, and may satisfy Elemental Cycle or an actual matching burst. A rapid charge is consumed only for its successful spell.
- A spell with remaining rapid charges observes the 0.5s refresh instead of its ordinary recast. Once that element's charges are exhausted, its ordinary cooldown applies. Expiration removes unused charges and exposes the ordinary cooldown still remaining; it does not reset cooldowns again.
- Rapid Weave cannot refresh itself, martial abilities, Mend, Aegis, Guard, or Evade. Death or encounter termination removes its active window without clearing its 180s recast.
- Trust Hecate uses all three elements, honors resources and burst opportunities, and deliberately uses Rapid Weave when a complete set is affordable. Six rapid casts require 420 MP before refunds; that is the conservative trust activation budget.

This is a bounded refresh opportunity rather than one instantaneous reset, which by itself would not guarantee the repeated sequence requested. Its duration, charge count, normal cadence, MP refund, and burst bonus are explicit proposed balance values.

Resource sanity check, before caps or interruptions: a normal six-second cycle spends 210 MP, returns 140, and receives 78 from the existing 13 MP/s combat regeneration. That leaves an 8-MP surplus per completed cycle. Six rapid spells spend 420 and return 280 through two completed sets. These calculations support the starting proposal; encounter testing still has to establish actual uptime and damage balance.

### Ariadne — Luminous Aegis and healing targets

**R:** An AoE invulnerability shield, one incoming hit per protected character, on a 1.5-minute cooldown. Keep automatic lowest-health healing.

**P shield contract:**

- Cast from Ariadne; grant one charge to Ariadne and each living ally within 18 units at activation. Range is a self-centered party area, not an enemy or selected-ally area. Proposed MP cost: 120; recast: **90s**.
- Each recipient's charge prevents the next otherwise-damaging hit completely and is then consumed. A raid attack consumes each struck recipient's own charge separately.
- There is no short hidden expiration in this initial design: the charge lasts until its first eligible hit, death, or encounter termination. Reapplication caps the recipient at one charge; it never stacks a second hit.
- Resolution order: dead/invalid recipient → evasion → one-hit shield → applicable mitigation → HP damage and its consequences. An evaded hit does not consume the shield.
- A blocked hit causes no HP loss, damage-taken TP, damage-driven enmity loss, or Revelry loss. Healing, buffs, zero-damage events, and UI effects cannot consume it.
- A multi-hit attack can remove the charge on hit one and damage on hit two. Shield blocks are ordinary combat protection; **Coherence Collapse still ends the encounter**.
- Show a light-wave barrier on each protected actor and a visible break when its charge is spent. Keep a compact charge indicator in party information rather than another large combat panel.
- Trust Ariadne uses Aegis for a telegraphed raid or dangerous targeted strike when protection is missing, while still prioritizing urgent healing. She must not repeatedly spend it simply because a basic attack is occurring.

**E/R healing contract:** With no explicit ally selection, choose the lowest HP **percentage** among living, wounded allies in range; stable roster order breaks ties. Keep the 70 MP cost, 5s Mend recast, and no resurrection.

**P manual healing:** Up/Down creates a one-use ally target for Mend. A successful manual heal honors that ally and then returns to automatic triage. An invalid, dead, full-health, or out-of-range explicit target produces a clear failure and spends nothing; it must not silently redirect the cast to somebody else. An Auto control clears the manual target. Trust healing always uses automatic triage. Aegis remains self-centered regardless of an ally soft target.

## 5. Targeting and control recommendation

Adopt the proposed directional split as the **default combat mapping**. This is a design recommendation for this game, not a claim that every game uses it.

| Input context | Up / Down | Left / Right | Other behavior |
|---|---|---|---|
| Combat, keyboard arrows | Previous/next living teammate | Previous/next living enemy | WASD still moves; mouse drag still looks; Tab/Shift+Tab remain enemy shortcuts. |
| Combat, controller D-pad | Previous/next living teammate | Previous/next living enemy | Left stick moves, right stick looks, A opens Commands. No D-pad spell or Revelry dispatch in the new default preset. |
| Commands open | Navigate command rows | Back / enter submenu, as appropriate | Consume the input within the menu; no combat retarget, camera movement, or accidental ability. |
| Settings, forms, browser focus | Native UI navigation | Native UI navigation | Gameplay input remains suppressed. |
| Touch | Compact ally-selection affordance with Auto mode | Existing enemy selector / enemy tap | Separate target selection from character switching. Keep thumb movement plus ability taps possible. |

Maintain independent hostile and friendly selection. Selecting an ally must not drop the enemy lock, change boss enmity, alter the controlled character, or send a healing action by itself. Offensive abilities use the hostile target; Mend uses the explicit friendly selection or the auto policy. With one enemy, Left/Right keep it selected and show selection feedback; they never clear it.

**P ergonomics:** Move default keyboard camera keys to I/K for pitch and J/L for yaw. For controller, provide three role-aware primary slots on X/Y/RB: the three weaponskills for martial roles, Fire/Ice/Thunder for Hecate, and Mend/Aegis/Guard for Ariadne. Other techniques remain reachable in Commands and remappable. Display the actual role-specific binding; Rapid Weave must be usable without surrendering the D-pad target split.

Version the settings migration. Convert the known old default layout; preserve deliberate custom bindings and expose conflicts rather than silently overwriting them. Distinguish selecting a party target from the existing Take control action in solo play. Never allow selecting a teammate to transfer ownership in an online room.

The combat enemy list still contains the existing boss; this UKSL does not add enemies merely to demonstrate cycling. Pure selection tests can exercise multiple candidates.

## 6. Boss kit: preserve the foundation, add meaningful interactions

**E:** Existing phase thresholds are 67% and 33% HP. Existing specials are telegraphed and phase-scaled. Preserve their recognizable shapes and counterplay.

| Ability | Existing or proposed behavior | Intended response |
|---|---|---|
| Crown Strike | E: tank-targeted basic attack; base 180 before phase scaling | Enmity management and ordinary mitigation. |
| Null Impact | E: 3s warning, radius-5 circle, base 740 | Leave marked ground; Evade or Aegis can prevent a hit. |
| Crown Sever | E: 3s warning, range-12 cone, base 620 | Leave the cone; preserve agreement between telegraph and hit geometry. |
| Terminal Pulse | E: 4s raid warning, base 260 | Guard, healing recovery, or party Aegis. |
| Regent's Decree | P: phase 2+, 3s targeted warning, one physical hit of base 1,000 | Tank uses Guard/Aegis/Evade. Mark the actor chosen at cast start; a fallen target fizzles rather than silently transferring the strike. |
| Terminal Echo | P: phase 3, 4s warning, two raid pulses of base 300 spaced 1s apart | One shield charge blocks only one pulse; combine protection, Guard, and healing. |
| Coherence Collapse | E: god-mode terminal deadline at 450s, final 10s warning | Defeat the boss before the deadline. No new shield/refresh loop bypasses this endpoint. |

**P scheduler:** Give specials independent recasts as well as an encounter pacing interval. Initial recasts: Null Impact 18s, Crown Sever 20s, Terminal Pulse 30s, Regent's Decree 35s, Terminal Echo 40s. Preserve deterministic selection and prohibit overlapping boss casts. Map the phase sequences locally in KSL-05 so successive abilities leave a real response opportunity; do not produce a burst of overdue casts after catch-up or a phase transition.

Existing phase/god damage multipliers remain the initial baseline. Explicitly classify damage types for Heracles's physical mitigation: Crown Strike, Crown Sever, and Regent's Decree are physical; Null Impact, Terminal Pulse, and Terminal Echo are nonphysical. Collapse is a terminal encounter rule.

Calibrate after the character kits function together. Target the current encounter identities: a roughly 100–180s active trial and a roughly 300–450s actively played god encounter are proposed reference bands, not permission to hide bad mechanics by only changing boss HP. Record damage contribution, MP/TP availability, deaths, chains, bursts, and actual use of defensive tools. Preserve the existing idle-trial accessibility and idle-god collapse checks. Exact HP/damage amendments belong to KSL-05 Stage 1 and receive a tuning receipt.

## 7. Intra: bounded KSL traversal

Dependency order: **KSL-01 → KSL-02 → KSL-03 → KSL-04 → KSL-05 → KSL-06 → Ultra Stage 3**. This plan does not require parallel agents. Each KSL produces its own map, change receipt, and evidence before handing off.

| KSL | Local goal and boundary | Required handoff / exit evidence |
|---|---|---|
| **01 — Combat definitions and authoritative state** | Stable ability IDs, individual recasts, recovery rules, seeded hit/crit support, scheduled-hit identities, trait calculation, and backward-compatible state contracts. No new finished character kit claimed here. | Engine/UI availability share definitions; legacy cooldowns migrate conservatively; invalid/replayed inputs cannot grant resources; deterministic state and save/room roundtrips pass. |
| **02 — Friendly/enemy targeting and input contexts** | Independent selections, auto/manual Mend targeting, combat directional defaults, context isolation, and settings migration. | Lowest-HP automatic heal retained; explicit target behavior verified; arrows/D-pad do exactly one contextual operation; character control and targeting remain separate. |
| **03 — Martial traits and sequences** | Bacchus/Heracles extra auto hits, physical criticals, Store TP, Critical Dash, Split Volley, and the narrow Dolos self-chain permission. Include trust decisions and hit-event contracts. | Three 2× dash hits and legal return; five-arrow TP accounting; a real zero-to-1,250-TP self-close within the chain window; no recursive procs or post-terminal hits. |
| **04 — Elemental rotation and light protection** | Hecate rotation/MP cycle/Rapid Weave, Ariadne Triage/healing-power baseline/Aegis, and corresponding trust decisions. | Per-spell independence, six requested rapid casts, correct expiration/recast behavior, per-recipient one-hit protection, and safe healing targeting. |
| **05 — Encounter composition and tuning** | Extend the current boss with the mapped tankbuster/double pulse, independent recasts, phase sequences, and evidence-backed balance adjustments. | Telegraph geometry/timing match resolution; defenses compose with multi-hit damage; active encounter paths remain viable; terminal collapse and mode identity remain intact. |
| **06 — Complete player-facing integration** | Wire every new ability/trait into command, desktop, controller, and touch interfaces; expose state through concise visuals and accessible labels. Finish required presentation from earlier event contracts. | No invisible or unreachable mechanics; each cooldown/charge display matches simulation; responsive screens stay usable; multiplayer views show the same resolved effects. |

### Initial local map: KSL-01

Goal: provide the smallest shared combat foundation that can support the agreed kits without parallel copies of cooldown, resource, or hit rules.

Stage 1 outputs before implementation:

1. A definition matrix linking each stable ability ID to allowed roles, cost, recast, target policy, recovery, and effect category.
2. A state/schema amendment covering the deterministic random stream, active hit sequences, ability-specific timers, and version/migration ownership. Choose a save version explicitly; do not silently relabel old snapshots.
3. Migration rules: old `magic` remaining time initially gates **all three** new spell recasts; old `weapon` remaining time gates all three weaponskills. This prevents loading from granting free refreshes. Preserve unrelated cooldowns, encounter progress, and Revelry. Default absent new buffs/charges to inactive.
4. A strict request-validation amendment. Clients may identify an ability and permitted target; the server determines all outcome-bearing fields. Keep room ownership and duplicate-sequence behavior unchanged.
5. Test cases for cooldown boundaries, invalid requests, deterministic rolling, hit uniqueness, state restore, and client/server availability agreement. Identify existing tests whose expectations are deliberately changed.

Stage 2 bound after BUILD: implement only that mapped foundation and its necessary adapters/migrations. Preserve the running baseline while introducing extension points; do not represent unimplemented kit buttons as ready features.

Stage 3 gate: verify recast independence, resource conservation, seeded repeatability, single execution per scheduled hit, and legacy migration. A failed check returns to this KSL's Stage 1 for a bounded correction. A change that alters the whole scope or dependency model returns to Ultra Stage 1.

Later local maps resolve implementation details when reached. Their required behavior and exit targets above remain the contract.

## 8. Infra: the integrated result and receipts

The deliverable is the existing game with these mechanics working through its shared engine, network validator, save system, trusts, and actual player interfaces. A design document, isolated pure function, animated preview, or passing unit suite alone is not that deliverable.

Persist these receipts with the implementation work:

- **Baseline:** starting commit, state/schema versions, and relevant existing behaviors.
- **Decision:** requested requirement versus proposed value; approved amendments and their owner.
- **Build:** commit and files changed for each KSL, with traceability to its local map.
- **Verification:** exact tested revision, scenario/seed/input sequence, expected and observed result, and meaningful failure output.
- **Tuning:** before/after values and encounter metrics supporting the adjustment.
- **Release:** final tested source, GitHub main receipt, matching deployed source tree, and deployment result if publication is authorized.

Do not store room secrets or access credentials in receipts. Do not infer PASS from an animation or from a log message without checking the resulting combat state.

## 9. Ultra Stage 3: whole-game acceptance

The following are integration checks, not a place to finish implementation. Run them against the assembled build and the actual inputs/UI, while retaining relevant local evidence.

| ID | Required observation |
|---|---|
| U01 | All five characters have the mapped functional subtraits. Each activated ability has its own recast, and its visible availability agrees with authoritative acceptance. |
| U02 | Fire leaves Ice and Thunder individually available; the normal three-element loop works at the mapped cadence and sustains its resource contract. |
| U03 | Rapid Weave enables Fire → Ice → Thunder twice, with 0.5s spacing when inputs/resources permit; the seventh rapid cast is unavailable, exhausted elements obey normal recasts, and Rapid Weave cannot be reused before 180s. |
| U04 | Ariadne's AoE grants independent charges to eligible living recipients. One raid hit is prevented for each protected actor; a second hit lands unless another defense applies. Out-of-range allies are not falsely shown as protected. |
| U05 | Shield prevention preserves Revelry and grants no damage-taken TP. Evasion preserves the shield. Guard plus Heracles mitigation uses the documented order. Collapse remains terminal. |
| U06 | Dolos opens Pierce, generates closing TP through his volley from zero, and self-closes Resonance inside 1.5–8s. He cannot do so without permission, and another character does not inherit the exception. |
| U07 | Bacchus delivers exactly three guaranteed 2× hits, gains TP only for landed hits, and returns to his start. Boss death, his own death, Evade cancellation, arena edges, and reconnect do not duplicate strikes or teleport another actor. |
| U08 | An ordinary critical is 1.5×, extra-hit procs are bounded, and no physical crit bonus leaks into healing, spell damage, or chain bonus damage. Fixed-seed runs agree after save/load and different elapsed-time partitions. |
| U09 | Auto Mend chooses lowest HP percentage, not largest missing HP or lowest absolute HP. Manual Mend honors the selected valid ally, then returns to Auto; invalid manual targets fail without an unintended heal. |
| U10 | Combat Up/Down select teammates; Left/Right select enemies. Menus and forms retain their own navigation. No direction also casts, moves the camera, changes controlled character, or transfers online ownership. |
| U11 | Trusts use the new kits coherently: Dolos preserves a viable close, Hecate rotates and bursts, Ariadne heals and protects, Bacchus enhances/dashes, and Heracles retains threat. Safety movement does not become a permanent offensive stall. |
| U12 | Boss phase changes, independent recasts, telegraphs, targeted strikes, and paired pulses resolve correctly. Actively played trial/god encounters remain winnable; an idle god encounter still collapses and the accessible trial behavior remains. |
| U13 | Legacy saves/settings and current online rooms load through the mapped migration. Duplicate room packets, reconnects during a sequence, stale targets, and forged cooldown/TP/shield fields cannot replay outcomes. |
| U14 | Desktop, compact desktop, phone portrait, phone landscape, and controller play expose all required actions. HUD stays readable; new shields, hits, cooldowns, charges, and targets are shown concisely. Reduced-motion and accessible labels remain effective. |
| U15 | Test suite, type checking, production build, and the required real-browser/3D scenarios pass on the release revision. A tool lacking WebGL leaves 3D movement, effects, and telegraph verification explicitly unverified; it cannot produce an Ultra PASS for those checks. |

Minimum integration scenarios include: one controlled character plus four trusts for each role; a full encounter in both modes; deterministic scripted six-spell and self-chain sequences; a two-client online interaction and reconnect during an active hit sequence; and character/target selection changes while menus and touch controls are active.

The previous QA browser could not initialize WebGL. Schedule the required 3D checks on a working WebGL surface during implementation; do not reuse earlier HUD-only checks as evidence of three-dimensional dash or boss behavior.

Exit requires the integrated mechanics to satisfy the requested behavior, mandatory checks to pass, proposed values used in the final build to be recorded, and material unresolved issues to be explicit. Failed or unavailable required checks are not converted into PASS by labeling them cosmetic. The Operator then decides completion or a bounded further iteration.

## 10. Builder handoff

Begin at the recorded repository baseline, refresh the actual branch, and inspect any intervening changes before implementation. Preserve them deliberately. Treat this as the mechanics map for **“Finishing the mechanics listed here.”**

BUILD is authorized. Finalize the local maps, implement within them, verify, and assess the gates in dependency order. Independent implementation work may proceed concurrently against the shared contract; dependent acceptance gates still require their predecessors' evidence. Keep requested mechanics distinct from initial balance recommendations, preserve the existing game's identity, and route defects to their owning Stage 1. Do not quietly broaden into equipment, new enemies, architecture replacement, or a UI redesign.

When release is authorized, publish only the final tested source and report the actual repository/deployment receipts and remaining verification limits.
