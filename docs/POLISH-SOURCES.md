# Animation and effects polish: source review

Checked 23 October 2026. Research only: no assets downloaded, plugins installed, paid jobs started, or animations integrated by this review.

Start with the free CC0 libraries, fit selected motions in Blender, and author the signature weapon/particle work locally. Keep the $25 RunPod credit until a specific GPU experiment has a measurable purpose. More animation files will not solve hand contact, shoulder deformation, weapon timing, or silhouette clarity.

## Current artifact and evidence boundary

Reading the JSON chunks of all five shipped GLBs confirmed 22 joints and only `idle`/`walk` clips. The skeleton has hands but no finger joints. `hero-assets.ts` and `bacchus-combat.ts` separately provide Bacchus's current upper-body ready/strike/Arc Cleave layer and hand-attached Thyrsus; these runtime clips are not embedded in the GLBs.

`ANIMATION-SOURCES.md` records exact library clip/texture names and says a kit was previously prepared. Its archive, license files and manifest were not located in this review, so that claim is not a current file-availability receipt. The names below come from that repository record; creator pages were checked for license, edition and supported motion categories. Fresh binary clip-name/edition verification remains an acquisition gate. No third-party mirrors were treated as the creator's source.

## Official sources and editions

| Source | Verified statement and useful boundary |
| --- | --- |
| [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) | Creator: “Free for personal and commercial use, no attribution required.” CC0; **Free 1.1** includes the motion library. The $14.99 Source tier supplies editable Blender files. The page says all animations are free and future additions remain free; this is not a temporary giveaway. It asks users not to resell unchanged files or claim authorship. Retargeting onto non-KayKit characters is explicitly supported, with a visual-fit warning. |
| [Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library) | Creator: “Free to use in personal, educational and commercial projects.” CC0; **Standard** is free, **Pro $9.99**, **Source $14.99**. Do not treat the headline 120+ as the free subset. Current release offers root-motion and in-place variants; choose in-place for XI. The repository's earlier 43-track count is not freshly reverified here. |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) | License label: “Creative Commons CC0”. 80 images at 512×512. Useful sprite ingredients, not a ready-made Three.js magic system. |
| [Kenney Crosshair Pack](https://kenney.nl/assets/crosshair-pack) | License label: “Creative Commons CC0”. 200 images at 64×64; useful for optional target symbols. XI already has functional target/burst rings, so this is lower priority. |

CC0 is an asset public-domain dedication, not a software implementation or a promise that editable `.blend` sources are included. The [Creative Commons deed](https://creativecommons.org/publicdomain/zero/1.0/) permits copying, adaptation and commercial use, while retaining caveats about unrelated rights and endorsement. Preserve creator/edition/license/hash receipts when obtaining files.

## Small, useful clip and effect map

These are candidate fits, not finished choreography. Listed identifiers are exact spellings from `ANIMATION-SOURCES.md`.

| Hero | Recorded clip candidates | Work that makes it Terminus |
| --- | --- | --- |
| Bacchus | `Melee_2H_Attack_Stab`, `Melee_2H_Attack_Slice`, `Melee_2H_Attack_Spin` | Keep the existing Thyrsus foundation. Fit two hands to one shaft throughout the swing; distinct thrust, sweep and spin recoveries, restrained gold/violet shaft ribbon. Never let imported root motion move the authoritative actor. |
| Heracles | `Melee_Block`, `Melee_Blocking`, `Melee_Block_Hit` | Heavy planted defense and a coherent shield/ward response. Weapon toss needs authored wind-up/release/catch plus a separate prop trajectory; no verified ready-made toss clip is promised. |
| Dolos | `Ranged_Magic_Shoot`; `Ranged_Bow_Draw`, `Ranged_Bow_Release`, `Ranged_Bow_Aiming_Idle` only if the final prop uses a bow grip | Precise aim/release, elemental projectile silhouettes and brief impacts. Select motion to match the actual weapon, rather than forcing bow hand placement onto a different prop. |
| Hecate | `Spell_Simple_Enter`, `Spell_Simple_Idle_Loop`, `Spell_Simple_Shoot`, `Spell_Simple_Exit`; `Ranged_Magic_Spellcasting_Long` | Deliberate containment, charge and release. Bounded orbital arcs, a dense nucleus and converging particles make atomic-scale phenomena feel immense. This is a stylized quantum visual language, not a literal atom simulation. |
| Ariadne | `Ranged_Magic_Raise`, `Ranged_Magic_Summon` | Calm opening palms and smooth recovery. LightEddy: coherent spiral ribbons and soft light flowing to the confirmed recipient; keep her rhythm serene and review drape/shoulder deformation. |

Shared candidates: `Running_A`, `Running_B`, `Running_Strafe_Left/Right`, `Dodge_Forward/Backward/Left/Right`, `Hit_A`, `Hit_B`. Kenney `magic_01`–`magic_05` and `circle_01`–`circle_05` are names recorded in the existing kit notes, not freshly inspected files. Generic death clips still need selection and fit review.

Keep the Nameless distinct: fixed, agonized silhouettes, interrupted arcs, crackling/static fragments and incoherent timing. Do not merely recolor Ariadne's smooth healing effect. Preserve readable attack telegraphs and reduced-motion alternatives.

## Tools and the GPU decision

**Useful local tool: Rokoko's Blender retargeter.** The [official repository](https://github.com/Rokoko/rokoko-studio-live-blender) documents source/target armatures, editable bone mapping, scale adjustment and matched reference poses. Its actual [LICENSE.md](https://github.com/Rokoko/rokoko-studio-live-blender/blob/master/LICENSE.md) says “GNU LESSER GENERAL PUBLIC LICENSE”, version 3. The README's MIT badge conflicts with that file: retain the actual license and pin/check the chosen release before installing. The add-on is software, not an animation asset library; its license does not replace the source clips' terms. Streaming/Studio service features are a separate product. Current Blender-version compatibility has not been tested here.

**Evaluated, not recommended as the default: HY-Motion 1.0.** Its [official README](https://github.com/Tencent-Hunyuan/HY-Motion-1.0) lists minimum VRAM of 24 GB for Lite and 26 GB for Standard, excluding optional prompt-engineering overhead. It generates humanoid motion, but explicitly does not support seamless loops, in-place animation, multi-person interaction, or descriptions of objects/scenes. It does not solve weapon contacts or spell effects. Code/weights availability is not equivalent to unrestricted open source: the [Community License](https://github.com/Tencent-Hunyuan/HY-Motion-1.0/blob/master/License.txt) excludes EU, UK and South Korea, and section 5(c) explicitly applies territorial limits to outputs. It also has commercial and use conditions. The README describes training-data scale but does not provide a reusable dataset-rights inventory; acknowledged third-party models/tools require separate review if used. Do not treat generated motion as a CC0 pack.

For this milestone, bone mapping, grip correction, pose design and short loops can be done locally. A GPU can help a later neural-motion experiment or rendering/baking workload; it does not remove retargeting and visual QA. [RunPod's official pricing guide](https://docs.runpod.io/pods/pricing) directs users to the deployment console for current GPU prices, bills compute by the second, and notes persistent-storage costs. No number of useful clips per $25 is established here. If a future experiment is approved, specify the model/version, clip count, acceptance criteria and total spend cap before starting it.

## Recommended next art slice

1. Establish one editable reference pose and bone map, then fit one movement loop and one cast onto the real rig. Preserve +Y up, +Z forward, metre scale and feet at ground level.
2. Build one signature action per hero from the table. Bake contact corrections, export only required clips, and keep weapon props separate. Fingers require geometry/rig work if articulated grips become a requirement.
3. Drive animation and effect presentation from confirmed events. Separate opener, completed chain and landed burst. Magic currently resolves immediately: a visual anticipation phase does not introduce an interruptible casting mechanic.
4. Review front/side/back, feet, grip, clothing, interruptions, death/reset, all five concurrent actors, low-quality mode and reduced motion. Keep particle/trail pools bounded and shared GPU-resource ownership explicit. Update manifests only for assets actually shipped.
