# Static storm and Ariadne healing

The combat kernel owns a separate seeded storm timer. Every 180–300 combat seconds, lightning charges the enemy for two seconds. The discharge targets the nearest living player within 12 units, then up to two additional living players within five units of the previous recipient. Base damage is 420, reduced by 25% per jump. Existing evasion, Guard and one-hit shields apply. Spreading breaks the chain. Ambient distant bolts are decorative and cannot deal damage.

Existing enemy attacks deal 5% more damage. Enemy HP and the enrage wipe are unchanged. The new static attack uses its own stated damage values.

| Ariadne action | Base healing | Range | MP | Cooldown |
| --- | --- | --- | --- | --- |
| Shimmer Wave | 350 to each living ally | 18 units | 120 | 20 seconds |
| Mending Thread | 100 every two seconds, six ticks | Existing heal targeting range | 80 | 18 seconds |

Healing uses the existing healing-power and low-health Triage modifiers. Mending Thread uses the selected ally, otherwise the lowest health percentage in range; it refreshes rather than stacks. Trust Ariadne uses both abilities and considers Aegis during static charge. Local saves and room snapshots receive additive defaults; online requests carry intent only, never damage/healing outcomes.

## Visual and audio authoring

`game/engine.ts` emits confirmed actions and outcomes. `world-feedback.ts` deduplicates those events and suppresses stale playback. `storm-effects.ts` adds bounded Three.js bolt and ring pools; persistent charge and healing visuals follow live state. `combat-audio.ts` maps corresponding events to original synthesized one-shots, with an independent volume slider. Hero skins are unchanged.

For a future burn effect, first define the real status duration and damage ticks in the kernel. Start a small flame/ember layer and restrained crackle loop on application; attach them to the enemy and stop them on expiry, death or reset. A fire hit alone must not imply an ongoing burn.

For skillchain ignition and sealing, use the confirmed chain event for a short ignition flash and two-part sound. Keep the seal/sigil tied to the actual burst window and dissolve it when that window closes. A decorative seal does not grant an immobilization or silence mechanic.

For enemy casting, use the live cast duration and area for a growing ground telegraph and charge sound; play the impact only on resolution. Interruptions must cancel the warning loop. Shape, motion and icons should communicate meaning alongside color. Most rings, bolts and particles can be built directly in Three.js. Custom sigil textures and recorded/generated audio files can replace the procedural presentation without changing combat rules.

## Verification limits

Automated coverage checks deterministic timing, chain recipients and defenses, lethal discharge, healing totals, save migration, online intent validation, input mappings, Trust usage and sound event selection. The managed preview was unreachable from the browser during this pass, so visual composition and the audible mix remain unverified.
