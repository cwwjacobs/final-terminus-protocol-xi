# Hero animation pipeline

Status, 24 October 2026: **real retargeted clips, library enabled.** `public/assets/animations/hero-animations.glb` now holds eleven clips retargeted from the Quaternius Universal Animation Library (Standard, CC0) onto the hero rig; the receipt says `"placeholder": false`, so `HeroAssetCache` loads the library and attaches the props by default. Verified in headless Chromium: run cycle, spell cast on Hecate with the orbital staff, Heracles with spear and shield, trusts animating in combat. Rendered on real hardware: not yet.

Four of the eleven are **interim** stand-ins, listed in the receipt's `interim` array and in `INTERIM_CLIPS`: `Pistol_Shoot` for the bow release, `Punch_Cross` for the thrust, `Punch_Enter` for the block stance, `Interact` for provoke. The free library has no bow, two-handed polearm or shield clips. The current KayKit Character Animations pack (Free 1.1, itch.io, CC0) has all three (`Ranged_Bow_Draw/Release`, `Melee_2H_Attack_*`, `Melee_Block`); it needs a browser download — itch's free-download flow is not scriptable — then one more `--source` on the command below with `--map auto`. The legacy KayKit 1.2 pack mirrored on OpenGameArt is a six-joint blocky rig and does not fit this skeleton.

Sources used (kept out of the repo under `work/animation-sources/`, hashes in the receipt):

| Pack | File | License | Mirror |
| --- | --- | --- | --- |
| Quaternius Universal Animation Library, Standard | `AnimationLibrary_Godot_Standard.glb` (46 clips, Rigify DEF rig, `A_TPose` reference) | CC0 | https://opengameart.org/content/universal-animation-library |

## Why one library

All five painted heroes share one 22-joint skeleton: identical bone names and hierarchy (verified by hashing the joint tree of each GLB), differing only in bone lengths (Heracles's forearm is ~28% longer than Ariadne's). Rotation-only clips therefore transfer across the whole cast. One armature-only GLB, `public/assets/animations/hero-animations.glb`, carries every clip; the hero GLBs and their copy receipts in `public/assets/models/manifest.json` are untouched.

## Building the library

`scripts/animation/retarget.py` runs in Blender (`blender -b -P … -- args`) or with Blender as a Python module (`pip install bpy`, Python 3.11+). It needs no GPU.

```sh
python3 -I scripts/animation/retarget.py \
  --target public/assets/models/bacchus.glb \
  --source work/animation-sources/AnimationLibrary_Godot_Standard.glb --map rigify --reference-clip A_TPose \
      --clips "$(node --experimental-strip-types -e "import('./components/game/role-animation.ts').then(m=>console.log(m.referencedClips().join(',')))")" \
      --interim Pistol_Shoot,Punch_Enter,Punch_Cross,Interact \
  --out public/assets/animations/hero-animations.glb
# When the KayKit Free 1.1 pack is present, add a second source and move the
# bow/2H/block rows in role-animation.ts to its clip names:
#   --source work/animation-sources/<KayKit rig>.glb --map auto --clips Ranged_Bow_Draw,Ranged_Bow_Release,Melee_2H_Attack_Slice,Melee_2H_Attack_Stab,Melee_2H_Attack_Spin,Melee_Block
```

- `--target` is the canonical rig; any hero file works, Bacchus is the reference.
- `--map rigify` is the Quaternius library (Rigify `DEF-` bones); `--map mixamo` the Mixamo names; `--map auto` matches by synonym and side and prints the resulting table plus any unmapped canonical bones. Fill gaps by editing `SYNONYMS`, `MIXAMO` or `RIGIFY` in the script.
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

Contact times in the role map were measured on the retargeted rig as the frame of peak right-hand reach (Sword_Attack 0.30 s of 1.53 s, Punch_Cross 0.27 s, Pistol_Shoot 0.47 s, Spell_Simple_Shoot ≈ 0.15 s, Spell_Simple_Enter 0.50 s). Re-measure when a clip changes: `scripts/animation/retarget.py` has no probe yet; the one-off used for these numbers is in the pipeline commit message.

## What to review before activating real animations

1. Done for the Quaternius set: receipt is `placeholder: false` with per-clip source hashes. Remaining: the KayKit Free 1.1 pack for bow, two-handed and block clips, replacing the four interim rows.
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
