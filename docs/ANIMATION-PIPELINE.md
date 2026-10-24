# Hero animation pipeline

Status, 24 October 2026: **real retargeted clips from KayKit Character Animations 1.1, library enabled, no interim stand-ins.** `public/assets/animations/hero-animations.glb` holds eighteen clips retargeted from the KayKit medium rig onto the hero rig against each file's `T-Pose`; the receipt says `"placeholder": false` with an empty `interim` list and a SHA-256 per source file, so `HeroAssetCache` loads the library and attaches the props by default. Verified in headless Chromium on the painted rigs: Dolos's `Ranged_Bow_Release` with the bow standing vertical in the left hand, Heracles's two-handed swings and Arc Cleave spin with spear and shield, Hecate casting with the orbital staff, trusts animating in combat, run cycle. Rendered on real hardware: not yet.

Sources (kept out of the repo under `work/animation-sources/`, hashes in the receipt). Both are CC0; neither needs attribution, both creators take tips.

| Pack | Files used | Rig | License | Where |
| --- | --- | --- | --- | --- |
| KayKit Character Animations 1.1 | `Rig_Medium_{CombatMelee,CombatRanged,General,MovementAdvanced,MovementBasic,Simulation,Special}.glb` | 23 joints, no neck/clavicles/upper chest, extra wrist; `T-Pose` clip in every file | CC0 | https://kaylousberg.itch.io/kaykit-character-animations (Download Now → "No thanks, just take me to the downloads" → Free 1.1) |
| Quaternius Universal Animation Library, Standard | `AnimationLibrary_Godot_Standard.glb` (46 clips, Rigify `DEF-` rig, `A_TPose`) | 53 joints | CC0 | https://opengameart.org/content/universal-animation-library (direct zip, scriptable) — retargets cleanly with `--map rigify`; kept as the alternative source |

The legacy "KayKit Character Animations 1.2" on OpenGameArt is a six-joint blocky rig and does not fit this skeleton.

## Why one library

All five painted heroes share one 22-joint skeleton: identical bone names and hierarchy (verified by hashing the joint tree of each GLB), differing only in bone lengths (Heracles's forearm is ~28% longer than Ariadne's). Rotation-only clips therefore transfer across the whole cast. One armature-only GLB, `public/assets/animations/hero-animations.glb`, carries every clip; the hero GLBs and their copy receipts in `public/assets/models/manifest.json` are untouched.

## Building the library

`scripts/animation/retarget.py` runs in Blender (`blender -b -P … -- args`) or with Blender as a Python module (`pip install bpy`, Python 3.11+). It needs no GPU.

```sh
S=work/animation-sources/kaykit
python3 -I scripts/animation/retarget.py --target public/assets/models/bacchus.glb \
 --source $S/Rig_Medium_CombatMelee.glb --map kaykit --reference-clip T-Pose --clips Melee_2H_Attack_Slice,Melee_2H_Attack_Spin,Melee_2H_Attack_Stab,Melee_2H_Attack_Chop,Melee_Block,Melee_Blocking \
 --source $S/Rig_Medium_CombatRanged.glb --map kaykit --reference-clip T-Pose --clips Ranged_Bow_Release,Ranged_Bow_Release_Up,Ranged_Magic_Raise,Ranged_Magic_Shoot,Ranged_Magic_Spellcasting_Long \
 --source $S/Rig_Medium_General.glb --map kaykit --reference-clip T-Pose --clips Hit_A,Death_A \
 --source $S/Rig_Medium_MovementAdvanced.glb --map kaykit --reference-clip T-Pose --clips Dodge_Backward,Dodge_Right \
 --source $S/Rig_Medium_MovementBasic.glb --map kaykit --reference-clip T-Pose --clips Running_A \
 --source $S/Rig_Medium_Simulation.glb --map kaykit --reference-clip T-Pose --clips Cheering \
 --source $S/Rig_Medium_Special.glb --map kaykit --reference-clip T-Pose --clips Skeletons_Taunt \
 --out public/assets/animations/hero-animations.glb
```
The clip list must stay equal to `referencedClips()` in `role-animation.ts`; `tests/animation-library.test.ts` fails otherwise.

- `--target` is the canonical rig; any hero file works, Bacchus is the reference.
- `--map kaykit` is the KayKit medium rig; `--map rigify` the Quaternius library (Rigify `DEF-` bones); `--map mixamo` the Mixamo names; `--map auto` matches by synonym and side and prints the resulting table plus any unmapped canonical bones. Fill gaps by editing `SYNONYMS`, `MIXAMO`, `RIGIFY` or `KAYKIT` in the script. Canonical bones a source lacks (KayKit: neck, clavicles, upper chest) follow their parents.
- `--interim A,B` records which output clips are stand-ins from a real pack; `role-animation.ts` keeps the same list so the receipt test can hold them together.
- `--reference-clip` names the source's T-pose clip. The hero bind pose is a T-pose; the transfer is the source bone's world-rotation change from that reference applied to the hero bone's rest, so both rigs must agree on what "neutral" is. Pass `-` when the source armature rest pose is already a T-pose.
- `--rename Old=New` per source renames clips on output; `--no-vertical` drops the hips' vertical travel (horizontal travel is always dropped: the combat kernel owns position).
- `--selftest` runs the maths against a synthetic A-posed rig with different proportions: arm and spine deltas must transfer within 1°, hips travel scales by hip height, unmapped bones follow their parents, the export round-trips, and a deliberately wrong map fails. `--stub <names>` writes placeholder clips for those names.

The receipt lists every clip with its source file, source clip, frame count, seconds, bone coverage and reference, plus the output's byte size and SHA-256. `tests/animation-library.test.ts` checks the receipt against the file and that every clip the role map references exists and drives all 22 joints.

## Runtime

| File | Role |
| --- | --- |
| `components/game/role-animation.ts` | Pure. Event → action key (`auto`, `weapon:<id>`, `magic`, `burst`, `heal`, `provoke`, `guard`, `dodge`, `revelry`, `hit`, `down`), per-role clip, contact time, body mask, playback rate. Signature actions are deliberately unmapped until they have dedicated choreography. |
| `components/game/action-layer.ts` | Blends the hero's own idle/walk, the library run loop and one-shot actions on one mixer. Locomotion is split into lower/upper halves so an upper-body action (attacks, casts) leaves the legs on locomotion and a full-body action (hit, dodge, death) takes everything, with weights that sum to one per bone. Death holds its last frame and ignores trailing hits. |
| `components/game/hero-props.ts` | Procedural spear + shield (Heracles), bow (Dolos), orbital staff (Hecate), thread staff (Ariadne), attached to hand/forearm bones so library clips carry them. Bacchus keeps `bacchus-combat.ts`, whose two-hand grip solver and polearm pose bones are reserved from the library. |
| `components/game/hero-assets.ts` | Gates placeholder playback, loads an enabled library once per cache, indexes clips (scale tracks and non-hips translations dropped), builds the layer and props per visual. A disabled, missing or failing library keeps existing hero presentation. |
| `Scene.tsx` | Forwards authoritative events to the actor's visual; ordinary impacts may use the returned contact delay. The existing `immediateImpact()` rule preserves scheduled multihit/sequence feedback timing. The `down` event also reaches a fallen actor so a future death clip can play. |

Contact times in the role map: measured on the retargeted rig as the frame of peak right-hand reach where that is the strike (Ranged_Bow_Release 0.27 s, Ranged_Bow_Release_Up 0.13 s, Melee_2H_Attack_Stab 0.80 s, Melee_2H_Attack_Chop 0.80 s, Melee_2H_Attack_Spin 1.5 s, Melee_Block 0.43 s, Skeletons_Taunt 0.47 s, Cheering 0.67 s), and chosen by eye for Slice (0.45 s of 1.10 s) and the magic shoots (0.30 s), where reach does not mark the moment. Re-measure when a clip changes; the probe is a dozen lines of bpy (sample each clip at 30 Hz on the retargeted armature, report the frame of max horizontal |hand_R − hips|).

## What to review before activating real animations

1. Done: receipt is `placeholder: false`, `interim: []`, per-source SHA-256. `Ranged_Bow_Draw` and `Ranged_Bow_Aiming_Idle` exist in the pack but are unused until a draw→release sequence is sequenced with the signature-ability work.
2. In the browser, per hero: run cycle at speed (foot slide), hit reaction, death pose, each weaponskill, Hecate cast, Ariadne heal, Dolos draw/release with the bow in the left hand, Heracles's shield position on `forearm_L` and spear grip. Check hip translation/grounding across the different proportions, root motion, shoulder motion and contact frames. Fit and verify the longer-armed heroes individually.
3. Bacchus: the library drives only his legs/hips and head; confirm hit and dodge read correctly under the polearm pose, and decide whether his auto/weaponskills move to library clips with the grip solver generalized over them.
4. Add dedicated mappings and choreography for Critical Dash (three timed contacts and return to origin), Split Volley (multiple contacts), Rapid Weave (rapid elemental cast/release cycle), and Aegis (party shield activation and one-hit break). Use authoritative `source`, `sequenceId` and `hitIndex` metadata where available; do not infer these actions from display text or restart a full ability on every hit. Preserve kernel-owned movement, damage, TP and cooldown timing.
5. Reduced motion is unchanged: clips still play when enabled; only HUD motion is reduced. Check rendered 3D, reduced motion and performance on real devices before activation.

## Not done here

- Two-hand grip fitting for Heracles's spear during 2H clips (the thyrsus solver is Bacchus-only). Expect the off hand to float off the shaft until `bacchus-combat.ts`'s `arm()` fit is lifted into a shared post-mixer pass.
- Directional strafe selection: the library declares left/right clips, but the runtime currently receives only scalar speed and uses the forward run loop.
- Dedicated signature-ability animations, element-distinct releases, shield break, boss cast/impact and phase-transition effects. Existing gameplay markers and effects remain in place.
- Cast charge/release effects and element particles (`Spell_Simple_Enter` → loop → `Shoot` with emitters); real channeling in the kernel.
- Boss skin pass.
- Physical-device and performance checks; the library adds one mixer action set per hero and no per-frame allocation.
