# Mechanics build verification — October 24, 2026

BUILD authorized by the Operator. Character animation production was explicitly assigned to Claude during this build. This receipt covers mechanics, controls, persistence, and compact state indicators. It does not declare an Ultra PASS for unperformed hardware or 3D presentation checks.

## Baseline and ownership

- GitHub baseline: `4dc06e146641b477146afcb28dfcf389915889b3` on `main`.
- Existing Sites source: `3893184905d5100b1b3478975ee52d81418a598f`, same tree as GitHub baseline (`dfb9dd1c047bccf7cabb7b7aad69209719475713`).
- GitHub was refreshed during final review; no intervening main changes were present then. Publication uses a branch-head lease to preserve concurrent work.
- Approved scope: [mechanics UKSL](mechanics-uksl.md). Existing rigs, character clips, and the animation implementation are unchanged. Scene changes are state indicators and immediate routing of authoritative sequence-hit feedback.

## Bounded implementation maps and receipts

| KSL | Final local map and implementation | Verification |
| --- | --- | --- |
| 01 | Shared `actionUnavailable`/`getCooldown`; independent cooldown keys; saved seeded RNG; schema v2; sequences with ID, scheduled and landed hit counts; explicit event sequence/hit identity. | Recast independence, rejection without spending, seeded/partitioned replay, mid-sequence JSON restoration, version-1 conservative cooldown migration. |
| 02 | Vertical ally / horizontal enemy input; IJKL camera; role primary slots; v4 default migration preserves custom bindings. Friendly selection is separate from control. Manual Mend has exact server packet/action receipts. | Keyboard F/1 and simulated controller X/LB pass through input→target routing→engine; menus suppress combat input. Failed and stale manual-target scenarios preserve selection. |
| 03 | Physical traits, bounded extra autos, 1.5× ordinary crit; three 2× Dash hits with return and cancellation; five Volley hits with Store TP and one self-close permission. | Exact hit/TP totals, self Distortion close, arena bounds, death/cancellation, no terminal replay, first-landed arrow permission, stable event IDs. |
| 04 | Normal elemental rotation; fixed 12-second Elemental Cycle; six Rapid Weave charges; self-centered Aegis; lowest-HP% Auto Mend and Triage. | Six half-second casts, ordinary recast preserved, duplicate element resets cycle, per-recipient one-hit protection, evade→shield→mitigation ordering, manual target behavior. |
| 05 | Existing boss abilities retain geometry and phase rules; Decree locks an actor; Echo resolves two pulses; independent boss recasts; encounter HP tuning below. | All five active role paths win in both modes. Dead Decree targets fizzle. Echo continues after the last threat target dies. Idle God retains collapse. |
| 06 | Shared role kit drives desktop/touch/Commands. Party sheet contains traits and separate Take control. Shield/Weave/target/crit indicators consume state/events. | Automated kit/icon/feedback tests; live browser touch activation, visible charge/recast changes, friendly selection, local two-client room/reconnect, portrait/landscape fit. |

## Automated checks

`npm test`: **196 passed, 0 failed, 0 skipped** on the assembled code after the final Echo correction.

`npm run typecheck`: **passed**. `git diff --check`: **passed**.

The production bundle is rebuilt by the Sites packaging workflow before publication. Build failure blocks publication. Lint was not a release gate for this change; existing touch-input ref-pattern lint findings were not treated as new mechanics defects.

Reproduce active encounter checks:

```sh
node --experimental-strip-types scripts/verify-mechanics-encounters.mjs
```

This fixed-seed script submits legal gameplay intents, movement, defenses, role techniques and chain decisions with one human-controlled slot and four trusts. It asserts victory, five living party members, and the mapped duration band. It is a simulation, not a human playtest. Full metrics are retained in [mechanics-encounters.json](mechanics-encounters.json).

| Controlled character | Trial seconds | God seconds |
| --- | ---: | ---: |
| Bacchus | 113.05 | 326.20 |
| Heracles | 113.45 | 327.45 |
| Dolos | 108.60 | 327.65 |
| Hecate | 108.45 | 320.65 |
| Ariadne | 114.10 | 329.05 |

All ten retained runs use seed 123 and finish with five living actors. Trial generates 33–35 chains and 16–19 bursts; God generates 99–104 chains and 55–60 bursts. Independent review with a different legal input cadence also won all ten role/mode combinations.

## Tuning receipt

Boss HP changed from **75,000 → 105,000 Trial** and **240,000 → 310,000 God**. The improved elemental rotation and new kits made the old God HP passively winnable. The revised health restores the intended active contribution requirement while the scripted active paths remain within 100–180s Trial / 300–450s God bands. This is an initial tuning decision, not a human balance study.

Idle Bacchus plus four trusts retained Trial victory. God reached the 450-second collapse across sampled seeds `0, 1, 2, 3, 8, 42, 123, 2000, 5370206, 4294967295`, leaving approximately 15,252–26,471 boss HP. Other mapped ability costs/recasts and role trait values were retained.

## Browser and online observations

- Live preview: selecting Hecate as Mend target left Bacchus controlled; Take control remained a separate operation.
- Ariadne touch Aegis activated, displayed one-hit protection, and entered its own 90-second recast.
- Hecate's compact UI displayed independent element recasts, a Rapid Weave window and per-element charges; an actual Fire click consumed one Fire charge.
- At 390×844 portrait and 844×390 landscape, every visible mage combat/menu button fit inside the viewport. Combat buttons measured 57×57 and approximately 53×51 pixels respectively. The enemy health/cast bar stayed at the top.
- Two independent browser tabs created/joined the same local D1 room. After reload, reconnect restored Bacchus and Heracles to their respective server-owned slots. Host keyboard Revelry entered cooldown and the second client showed Patk/Matk 105.
- The local preview needed the existing schema migration applied to its initially empty local database. No production schema change was added.
- During development, hot reload re-ran local-save hydration while rooms were open. Both clients were reloaded and explicitly reconnected after code stabilized before the final cross-client observation. These are local preview observations, not a wide-area latency test.

## Retained limits and animation handoff

The browser reports `THREE.WebGLRenderer: Error creating WebGL context`. Actual 3D movement, shield appearance, effect placement and telegraph rendering were not visually verified. Physical controller hardware was not available; Gamepad API routing was tested with simulated input. Live browser reconnect during the exact 1.2-second Dash window was not captured; deterministic save/room continuation and duplicate-packet scenarios passed automated checks.

Consequently the code and mechanics checks pass, but **Ultra Stage 3 is not declared fully passed**. Claude owns the requested animation work and its visual acceptance. Its consumer can use `CombatEvent.sequenceId`, `hitIndex`, `source`, `critical` and the authoritative actor positions; animation callbacks must not award damage or TP. `source` is `criticalDash` or `splitVolley` for these hit events. Existing engine timing owns each hit and return.

Repository and deployment IDs are reported by the release operation after packaging; no room secrets, credentials or invite codes are retained here.
