# Engaged camera and burst feedback — verification

The controlled living character locks the camera onto the living encounter enemy while engaged. Disengaging, death, or encounter completion releases the view without resetting zoom or snapping the camera. Look input cannot break the engaged lock. Tracking uses the rendered actor and enemy positions, shortest-angle damping, a bounded turn speed and a close-distance heading guard.

Burst presentation reads the existing combat rules. A weaponskill opener gets an opener panel; a valid second weaponskill forms a skillchain and opens the elemental window. The completed panel identifies both participating characters, the matching spell, a countdown and a shrinking progress bar. The enemy ring and available matching spell use the element color. A confirmed burst event displays its damage. Static spell hints no longer imply that every spell or weaponskill has an active burst opportunity.

## Automated checks

- All 117 tests pass, including engaged camera activation/release, look suppression, preserved zoom, yaw seams, target movement and capped frame intervals.
- Feedback tests cover all three valid skillchain pairs, matching spells only, another actor's closer, minimum delay, disabled actions, expiration, actual burst events and encounter completion.
- TypeScript and the Sites production build pass. The existing client bundle size warning remains.
- Combat rules, action timing, damage values, critical-hit mechanics and multiplayer protocol are unchanged.

## Browser checks

Using the production preview, moving forward and strafing keeps the enemy framed. Mouse drag and keyboard look do not break engagement lock; zoom remains available. Disengaging during combat allows free orbit; reengaging reacquires the target. Switching to Hecate maintains the correct engaged lock, and encounter completion releases it.

Observed the opener panel and completed Fire, Ice and Lightning windows. Only the matching available magic button received the burst cue. A keyboard-triggered Lightning spell during Fragmentation displayed `MAGIC BURST LANDED` and 1,020 damage; the combat log confirmed the burst event. Browser warning/error logs were empty during this check. Physical gamepad testing and multi-device online play were not performed for this revision.

## Prepared animation assets

The separately delivered animation kit contains inspected CC0 motion libraries from Quaternius and KayKit and effect/mark textures from Kenney, with original licenses and a file manifest. See ANIMATION-SOURCES.md for actual clip names and intended mappings.

These source clips are not retargeted or connected to the game yet. The existing Bacchus animation pass remains in use. Critical strikes are preparation only; no chance or bonus-damage mechanic was added.
