# Hero animation pipeline

Status, 25 October 2026: **all five painted heroes now use active code-authored upper-body combat motions.** Their original GLBs, skins, idle/walk clips, feet and kernel-owned position remain intact. `hero-motion.ts` fits Heracles, Dolos, Hecate and Ariadne to their own bone lengths by sampling the shipped idle and baking rotation-only arm/spine poses. `bacchus-combat.ts` keeps Bacchus's two-hand polearm solver. These motions do not depend on a generated asset service or the shared animation library.

The separate shared library is still gated. All 19 clips in `public/assets/animations/hero-animations.glb` remain synthetic stand-ins; its receipt still says `"placeholder": true`. `HeroAssetCache` does not request it by default. An explicit `allowPlaceholderLibrary: true` enables an isolated development preview, while `library: false` disables the library even in that preview. When a library is explicitly enabled it replaces the four heroes' procedural motion layer; Bacchus reserves his polearm bones. Do not change the receipt flag to activate the synthetic clips.

The actual shipped rig data is covered by automated pose/attachment tests, including Bacchus grip distance, finite transforms, distinct contacts, independent instances, root/feet preservation, death/revival and disposal. These are numerical rig checks, not rendered skin, grip or device approval. The available cloud preview has WebGL disabled, so this pass could not perform rendered 3D review.

## Why one library

All five painted heroes share one 22-joint skeleton: identical bone names and hierarchy (verified by hashing the joint tree of each GLB), differing only in bone lengths (Heracles's forearm is ~28% longer than Ariadne's). Rotation-only clips therefore transfer across the whole cast. One armature-only GLB, `public/assets/animations/hero-animations.glb`, carries every clip; the hero GLBs and their copy receipts in `public/assets/models/manifest.json` are untouched.

## Building the library

`scripts/animation/retarget.py` runs in Blender (`blender -b -P … -- args`) or with Blender as a Python module (`pip install bpy`, Python 3.11+). It needs no GPU.

```sh
python3 -I scripts/animation/retarget.py \
  --target public/assets/models/bacchus.glb \
  --source work/kaykit/<rig>.glb --map auto \
      --clips Running_A,Running_Strafe_Left,Running_Strafe_Right,Melee_2H_Attack_Slice,Melee_2H_Attack_Stab,Melee_2H_Attack_Spin,Melee_Block,Melee_Blocking,Dodge_Backward,Dodge_Right,Hit_A,Death_A,Ranged_Bow_Draw,Ranged_Bow_Release,Ranged_Magic_Raise,Ranged_Magic_Shoot,Ranged_Magic_Spellcasting_Long,Cheering \
  --source work/quaternius/<rig>.glb --map mixamo --reference-clip TPose \
      --clips Spell_Simple_Shoot \
  --out public/assets/animations/hero-animations.glb
```

- `--target` is the canonical rig; any hero file works, Bacchus is the reference.
- `--map mixamo` uses the Mixamo/Quaternius names; `--map auto` matches by synonym and side and prints the resulting table plus any unmapped canonical bones. Fill gaps by editing `SYNONYMS` or `MIXAMO` in the script.
- `--reference-clip` names the source's T-pose clip. The hero bind pose is a T-pose; the transfer is the source bone's world-rotation change from that reference applied to the hero bone's rest, so both rigs must agree on what "neutral" is. Pass `-` when the source armature rest pose is already a T-pose.
- `--rename Old=New` per source renames clips on output; `--no-vertical` drops the hips' vertical travel (horizontal travel is always dropped: the combat kernel owns position).
- `--selftest` runs the maths against a synthetic A-posed rig with different proportions: arm and spine deltas must transfer within 1°, hips travel scales by hip height, unmapped bones follow their parents, the export round-trips, and a deliberately wrong map fails. `--stub <names>` writes placeholder clips for those names.

The receipt lists every clip with its source file, source clip, frame count, seconds, bone coverage and reference, plus the output's byte size and SHA-256. `tests/animation-library.test.ts` checks the receipt against the file and that every clip the role map references exists and drives all 22 joints.

## Active runtime

| File | Role |
| --- | --- |
| `components/game/presentation-cues.ts` | Resolves authoritative identity/element and shared contact times. Signature source takes priority over ordinary attacks; shield break never re-casts Aegis. |
| `components/game/hero-motion.ts` | Fits upper-body poses to each real rig, bakes quaternion-only tracks, blends actions with a ready pose and leaves lower-body/root channels on original locomotion. An incomplete rig retains the safe existing fallback. |
| `components/game/bacchus-combat.ts` | Two-hand thyrsus grip, separate auto/Cleave/Pierce/Resonance, short per-contact Critical Dash accents, Revelry/guard/dodge/hit gestures and a transient strike trail. |
| `components/game/hero-props.ts` | Club and forearm shield (Heracles), recurve bow (Dolos), orbital staff (Hecate), thread staff (Ariadne), attached to the active bone motions. Props are visual only and owned/disposed by each hero instance. |
| `components/game/hero-assets.ts` | Owns independent skeletons, materials, mixers and actions, selects active motion or explicitly enabled library, resets on revival and exposes world-space hand/weapon anchors through `getAnchor()`. |
| `Scene.tsx` | Feeds authoritative events to visual motion and effects. Ordinary actions share contact delays; scheduled signature hits and support effects remain immediate. Combat state, damage, TP, recovery and cooldowns are unchanged by animation. |

Heracles raises and sweeps a club while carrying his shield; Pierce thrusts forward and Resonance comes down from a raised wind-up. Dolos draws/releases the bow and gets a short release for each Split Volley contact. Hecate has different Fire, Ice and Lightning release silhouettes and a Rapid Weave opening gesture; subsequent elemental casts can interrupt recovery. Ariadne has Restore, Aegis, Shimmer Wave and Mending Thread arm gestures. Guard, dodge, hit and death/revival accents are available on the active heroes. Death adds a group fall with a held upper-body pose; it is not a newly authored full-body falling clip.

Split Volley and Critical Dash deduplicate `sequenceId`/`hitIndex` contacts and play short accents rather than restarting an entire sequence. Aegis recipient events produce one caster gesture. Mending Thread heal ticks and Shimmer Wave recipient heals do not restart their activation gesture. Effects on recipients are handled separately by the presentation layer.

Shared contact seconds are: Bacchus auto `.27`, Cleave `.43`, Pierce `.30`, Resonance `.48`; other heroes auto `.20`, Cleave `.36`, Pierce `.28`, Resonance `.44`; elemental spells `.30`, Elemental Shot `.20`. Signature and support feedback stays immediate. These delays are visual scheduling only; there is no pre-cast channeling period in the combat simulation.

## Optional retargeted-library path

`role-animation.ts` maps ordinary events to library clips; `action-layer.ts` blends masked upper/lower-body actions. Their synthetic preview mappings intentionally omit signatures. The active default motions above are a separate implementation and do not change the placeholder rollout guard.

Before replacing the active procedural presentation with a real retargeted library:

1. Replace the synthetic file with fitted clips using the command above, commit the new receipt, and confirm `placeholder` is explicitly `false`. Run the Blender self-test and repository tests against that output.
2. Review every hero in a WebGL-enabled browser: body deformation, shoulder/elbow limits, club grip, shield face, bow draw, staff orientation, foot sliding and contact frames across differing proportions. Imported bind-pose offsets must not be compounded with idle rotations.
3. Preserve Bacchus's two-hand constraint or provide an equivalent fitted grip. Review incoming hit/dodge/death actions against his reserved upper-body bones.
4. Preserve signature semantics and add equivalent real library choreography before switching away from the active implementation. Sequence movement and hit times remain kernel-owned.
5. Check reduced-motion handling and performance on actual devices. The library and procedural motions must not both own the same bone tracks.

## Validation and limits

`tests/hero-motion.test.ts` parses all five actual GLBs without texture decoding and tests active motion, distinct weapon/spell contact positions, finite transforms, unchanged root/feet, signature deduplication, support tick handling, reset/death/revival, restoration of source bones and resource disposal. `tests/bacchus-animation.test.ts` retains the original grip/locomotion regression tests; the new test also checks Pierce, Resonance and Critical Dash remain within the existing 8.5 cm support-hand gap bound. `tests/hero-assets.test.ts` and `tests/animation-library.test.ts` retain sharing, fallback and placeholder gating checks.

The motions are code-authored first-pass choreography, not motion capture or artist-finished retargets. The bow string is a static prop; draw/release currently comes from the shoulder, elbow and hand motion. There is no directional strafing selector, full-body authored dodge/death, boss skeletal pass or new kernel channeling. Skeleton/anchor tests cannot prove the final painted skin, shield facing, weapon silhouette, camera readability or GPU performance. Those still need a WebGL-enabled rendered review.
