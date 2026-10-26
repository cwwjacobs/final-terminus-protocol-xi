# Combat presentation pass

25 October 2026. The existing five painted heroes now have code-authored combat motions, shared contact timing, spell and weaponskill effects, and original synthesized combat sounds. This pass changes presentation and event metadata, not damage, costs, cooldowns, RNG, movement authority, skins or class permissions.

## Coverage

| Event family | Presentation |
| --- | --- |
| Auto attacks; Arc Cleave, Vector Pierce, Resonance | Role-specific arm/weapon motions, weapon accents or projectiles, distinct contact masks and sounds |
| Fire, Ice, Thunder; elemental shots; Magic Burst | Element-specific preparation, release and target impact; amplified burst accent |
| Critical Dash, Split Volley | Activation plus individually confirmed hit accents; kernel movement and scheduled hits remain authoritative |
| Provoke, Revelry, Rapid Weave | Role motion and activation cue; remaining stacks/charges shown from live state |
| Restore, Shimmer Wave, Mending Thread | Cast motion, confirmed recipient glints, existing ground wave, live healing tether |
| Aegis, Guard, Evade; shield consumption | Defensive motion, ward or stance cue, one-hit shield break fragments |
| Skillchains | Element-tinted seal on the enemy while the chain or burst window exists |
| Enemy casts and impacts | Live cast charge, existing danger telegraphs, copied impact-area metadata and sound |
| Ambient storm and static discharge | Existing storm presentation retained; the same confirmed event feed supplies sound |
| Hit and defeat | Short reactions, impact accents and restrained sound |

Fire impact artwork does not imply a burn debuff. Ordinary Fire has no persistent burn; the later Rain of Fire ultimate has an explicit authoritative three-second burn. Preparation/contact delays are visual only; these spells still resolve under the existing kernel rules. Crown Resonance retains this presentation. The later divine-awakening feature adds the separate Logos encounter and procedural statue/Zeus visuals; see DIVINE-AWAKENING.md.

## Assets and authoring

Editable masters: [Terminus Combat VFX in Figma](https://www.figma.com/design/8SvJbL5Kaqkf3jmMyRCF3y). The 42-mask kit retains white transparent SVG masters and 512×512 PNG runtime exports under `public/assets/vfx/`. Runtime geometry supplies rings, crystal shards, bolts and threads; not every available design mask needs a dedicated draw call.

To revise an effect, edit its vector component, export a transparent PNG under the same asset ID, then adjust its scale, opacity, lifetime and attachment in `components/game/ability-effects.ts`. Ground masks must be circular top-down designs; upright ward illustrations remain billboards. Do not pre-project a ground ring and then project it again in 3D.

`presentation-cues.ts` maps structured events to a shared presentation key, element and contact time. `Scene.tsx`, hero motion and combat audio use that contract. New spells need an explicit event identity and a presentation mapping; display text is only a compatibility fallback for old events.

## Timing and lifecycle

Ordinary contacts use the shared authored delay. Signature hits, healing recipients, shield breaks and static events preserve the kernel's already-scheduled timing. Historical logs are baselined rather than replayed. Epoch changes, resets, local pause and hidden tabs clear pending transient presentation. Boss charge and persistent buffs follow current state.

The effect pool caps transient particles at 42 in Performance mode or 84 in High mode, with 4 or 8 bolts. Five fixed party slots own status cues. Textures load on demand and are disposed with the scene, including requests completing after teardown. Reduced motion removes travelling/spinning particle motion and lowers effect opacity; it does not remove necessary telegraphs or character actions.

Audio is synthesized locally with Web Audio. It uses 30 sound recipes, a reusable noise buffer, a 48-cue queue, at most 6 cues per tick and 18 voices. Existing defaults remain music 10%, effects 35%; saved user settings take precedence. It requires a user gesture to unlock browser playback. No generated-audio service or Figma AI generation is used.

## Verification limits

Automated checks exercise real GLB rigs, motion and contact selection, effect pool/lifecycle behavior, event metadata, save compatibility and audio scheduling. The preview's menus and combat HUD can be exercised, but this environment reports WebGL disabled. Rendered 3D appearance, subjective sound mix and physical-device performance still need inspection on a WebGL-capable device. No frame-rate benchmark or listening approval is claimed.

The final code run passed 305 tests and TypeScript checking. Changed audio and animation modules pass their focused lint checks. The repository-wide lint command still reports pre-existing findings in touch controls, input-profile hydration and storm/healing tests; this presentation pass does not claim a globally clean lint baseline.

The separate synthetic shared animation GLB remains disabled. See [ANIMATION-PIPELINE.md](ANIMATION-PIPELINE.md) for the distinction between active authored rig motion and future imported animation clips.
