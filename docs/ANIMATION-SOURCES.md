# Terminus XI animation and effects starter kit

Downloaded from the original creators and inspected on 23 October 2026. Every included pack has its original CC0 license. These are prepared source assets, not completed in-game animations. The paid Blender-source editions are not included.

## Recommended clips and effects

| Game action | Source and actual clips/assets | Integration needed |
| --- | --- | --- |
| Running and strafing | KayKit `Running_A`, `Running_B`, `Running_Strafe_Left/Right`; Quaternius `Jog_Fwd_Loop`, `Sprint_Loop` | Fit to each hero, blend by movement speed, preserve engine movement |
| Bacchus weaponskills | KayKit `Melee_2H_Attack_Slice`, `Melee_2H_Attack_Stab`, `Melee_2H_Attack_Spin`; Kenney slash/trace textures | Adapt for the Thyrsus polearm, constrain both hands, tune wind-up/contact/recovery |
| Guard and defensive abilities | KayKit `Melee_Block`, `Melee_Blocking`, `Melee_Block_Hit` | Blend into locomotion; play from confirmed action events |
| Dodging | KayKit `Dodge_Forward/Backward/Left/Right`; Quaternius `Roll` | Keep world displacement authoritative and avoid applying root movement twice |
| Spell casting | Quaternius `Spell_Simple_Enter`, `Spell_Simple_Idle_Loop`, `Spell_Simple_Shoot`, `Spell_Simple_Exit`; KayKit `Ranged_Magic_Spellcasting`, `Ranged_Magic_Spellcasting_Long`, `Ranged_Magic_Shoot` | Retarget arm/spine motion, connect charge/release/recovery phases to the spell event |
| Healing and support abilities | KayKit `Ranged_Magic_Raise`, `Ranged_Magic_Summon`, `Use_Item`, `Cheering` | Select per action; recolor and position effects on the recipient |
| Dolos ranged attacks | KayKit `Ranged_Bow_Draw`, `Ranged_Bow_Release`, `Ranged_Bow_Aiming_Idle` | Match the final weapon and hand anchors |
| Spell and casting effects | Kenney `magic_01`–`magic_05`, `circle_01`–`circle_05`, flame, spark, light and trace textures | These are textures, not prebuilt particle systems: animate emitters, tint by element, anchor to hands and impact |
| Target/lock-on mark | Kenney light crosshair shapes, circle and symbol textures | Billboard above the enemy plus a ground ring; animate on selection and distinguish active burst color |
| Critical strike preparation | KayKit `Hit_A`, `Hit_B`; Quaternius `Hit_Chest`, `Hit_Head`; Kenney spark, slash and flare textures | Prepare a stronger impact/reaction variant. No clip is labelled a dedicated critical hit. Do not trigger at random: critical chance and bonus damage are not part of this preparation request |

## Why the files need fitting

The current painted heroes use their own 22-joint skeletons. These libraries use different joint names, rest poses and proportions. Retargeting means transferring the motion to the hero's skeleton, then checking shoulders, elbows, feet and weapon grips. Renaming tracks alone is not enough.

1. Retarget a running loop and one casting sequence onto the painted hero rig.
2. Retarget the weapon families and correct the polearm's two-hand grip.
3. Build a shared animation layer for locomotion, action wind-up, release/impact, recovery, reactions and death.
4. Trigger effects from confirmed combat events. A chain opener, a completed skillchain and a landed magic burst remain separate signals.
5. Inspect movement plus attacks, animation interruptions, repeat actions and reduced-motion presentation. Test heroes independently so one actor's animation cannot affect another.

For casting, the current combat resolves magic immediately. A visual casting wind-up can delay presentation, but a real interruptible cast-time mechanic would be a separate gameplay change. Keep those meanings explicit.

## Original sources

- Quaternius Universal Animation Library Standard: https://quaternius.itch.io/universal-animation-library
- KayKit Character Animations Free 1.1: https://kaylousberg.itch.io/kaykit-character-animations
- Kenney Particle Pack: https://kenney.nl/assets/particle-pack
- Kenney Crosshair Pack: https://kenney.nl/assets/crosshair-pack

The manifest records filenames, hashes and the actual named clips inside the included GLBs. Quaternius Standard contains 43 named clips including its reference T-pose; the storefront's larger library count includes additional editions. KayKit's selected files are the medium-rig sets relevant to this game.
