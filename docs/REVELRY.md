# Revelry — Bacchus's party ability

Corey's selected contract, 2026-10-20:

- Only Bacchus grants Revelry. Each activation gives every living party member one stack, capped at five per character. It is party-wide in this first implementation, with no distance limit.
- Cooldown: 45 seconds. No TP or MP cost; available during a live encounter. Casting at the cap is allowed but does not exceed five.
- Each stack adds **5 Physical attack (Patk) and 5 Magic attack (Matk)**, up to +25 of each. These are flat attack-stat additions, not flat damage added to every hit.
- Taking positive damage clears **only that recipient's** stacks. Bacchus taking damage does not clear anyone else's stacks. Evading preserves stacks; Guard still takes damage and clears them. Death also clears them.
- Attacking, waiting and switching between player/trust control do not create stacks. Only another Revelry cast adds more. Bacchus as a trust uses the same action and cooldown.

## Small implementation boundaries

`game/content.ts` owns `REVELRY`, role base Patk/Matk, `ATTACK_BASELINE`, and `getAttackStats`. Initial role attack values are 100, preserving the earlier encounter's unbuffed damage. The provisional formula is `base damage × relevant effective attack / 100`, rounded once. For example, one stack makes Patk/Matk 105; a 112 base auto attack becomes 118 damage, while a 660 base weaponskill becomes 693. A future stat or defense formula belongs at this boundary.

Autos and weaponskills use Patk. Spells, Magic Bursts and skillchain damage use Matk. Each actor uses their own stacks; chain damage is calculated from the unmodified weapon amount and scaled once. Healing, TP gain, defense and incoming damage remain unchanged. Hate reflects the resulting damage.

`Actor.revelryStacks` is serializable state; the kernel owns grants, resets and damage. The HUD displays per-character stacks and the selected character's current Patk/Matk. `RevelryPanel` owns presentation only. Activation and loss use the existing bounded effect pool.

Default controls are Q and D-pad Right. Control preference version 2 adds the new command without replacing an existing custom binding. Explicit unbinds remain unbound. The existing browser storage key is retained so earlier preferences can migrate.

`restoreSave` migrates absent legacy stack fields to zero, then validates a detached copy. Room loading applies the same additive migration before simulation or duplicate-sequence snapshots. Present malformed counts are rejected. Existing local save keys, game-state version and D1 schema remain unchanged. Multiplayer accepts only the action intent, never a client-supplied stack count, recipient list or attack value.

## Encounter tuning boundary

Crown Resonance's existing Terminal Pulse can damage the whole party and clear each affected recipient. A successful evade preserves that recipient's stacks. Its cadence makes sustained stacking difficult; this release does not quietly rebalance that boss or exempt raid damage. Human playtesting should determine whether later encounter tuning is needed.

The narrative ending involving Logos's coherence threshold remains a separate planned feature in `LORE.md`.

## Verification

The full suite contains 91 passing tests, including stack grants/cap/cooldown, actor-specific reset, raid damage with a mixed guard/evade party, attack channel separation, healing isolation, trust/replay behavior, old save/room migration, client authority rejection, duplicate-packet protection and keyboard/controller preference migration.

Local HTTP/D1 testing with two independent sessions confirmed shared grants, role/cooldown rejection and duplicate protection. Browser testing confirmed 105 Patk/105 Matk at one stack, Heracles losing his stack while the other four retained theirs, visible cooldown, and saved stack/control restoration. A 720p layout overlap found during browser testing was corrected. Release checks and deployment receipts are recorded with the milestone.

Physical gamepad hardware and five-device internet play remain unverified. Automated Gamepad API tests verify the new binding's intent and press/release behavior, not a physical controller.
