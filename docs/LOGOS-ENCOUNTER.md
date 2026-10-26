# Logos — descent, sentinels, giant and escape

## Playable flow

Defeat Crown Resonance, then choose **Descend to Logos**. The host leads online parties. A 60-second intermission displays the completed Crown scoreboard while the platform travels down to the lower arena; combat inputs are suspended and the previous combat clock is frozen. The party is restored for the next encounter.

At the bottom, six statues — Observation, Judgment, Memory, Reason, Order and Knowledge — awaken and rush the party. They use melee charge, leap and ranged throw patterns. Each has 4,500 HP and can be selected with Tab, D-pad left/right or its target button. Direct hits and area effects resolve against actual enemies. Crown's statistics reset when this wave begins.

Defeating all six raises the giant Logos and unlocks the five ten-minute ultimates ready to use. The giant has three separate target surfaces: **head**, **left hand**, **right hand**. Heracles starts on the left hand, Bacchus on the right, while ranged heroes start on the head. Targets can be changed manually. Hands have 8,000 HP, pursue their threat target, strike with Titan Palm, and stagger for twelve seconds when broken before reforming. Thunderclap's forced targeting and stuns apply to both hands and the head.

The head has 210,000 HP in trial and 420,000 in god mode. Its Axiom Ray, Realm Shudder and Coherence Fracture rotation replaces Crown's attacks. Head damage doubles while both hands are staggered or held by melee heroes. The god deadline counts the giant fight, excluding the descent and sentinel wave. The entire second battle's statistics include sentinels and giant damage.

At zero coherence, Logos enters a six-second collapse instead of immediate victory. The floor visibly shrinks, falls and fades; the giant's vector layers fragment. The party briefly falls, then rises in an abstract escape light. Victory appears after escape. The text explicitly preserves Logos's survival. This stages escape without establishing a particular rescuer or changing the wider lore.

## Art and Figma provenance

[Logos encounter board](https://www.figma.com/design/8SvJbL5Kaqkf3jmMyRCF3y?node-id=35-672).

The existing Figma giant and six seated sentinel masters were inspected. The missing Melee Charge and Ranged Throw poses were added beside an encounter-flow board; a new coherence seal was drawn there and exported directly. The original kit's exact vector contours are used for the giant's eight independent parts and sentinel/rush artwork. The native asset-download endpoints returned HTML rather than SVG in this environment; those invalid bytes were discarded. `public/assets/logos/figma-manifest.json` records the source and node identity.

The artwork is articulated vector cutouts in the Three.js scene. Head and hands move independently; this preserves the supplied 2D concept rather than claiming a new volumetric model or hidden anatomy. Shared textures and geometry are bounded and disposed. Missing assets retain readable geometric fallback shapes. The existing painted heroes, Zeus form, ultimates, camera conventions and Crown presentation are preserved.

## State and controls

The authoritative `logos.stage` is none → descent → sentinels → giant → collapse → escaped. The same fixed-step state drives solo, room snapshots and reconnect. Enemy selection is a bounded intent, not client-supplied damage. Old saves receive neutral defaults; existing Logos saves resume the giant stage, including legacy echo artwork aliases. Fresh expeditions take the whole new route.

G / new-controller L3 / touch ultimate still use the controlled hero's ultimate. Explicit target buttons are available on all layouts. Existing custom controls are retained. Zeus form replaces Heracles's first three actions as before.

## Verification and limits

`npm test`, `npm run typecheck`, `node --experimental-strip-types scripts/verify-logos-encounters.mjs`, and the Sites production build verify source behavior. Dedicated tests cover the exact one-minute clock, frozen scoreboards, six kills before awakening, separate target HP, head-area bounds, twelve-second hand recovery, six-second escape, malformed target intents, snapshots and replay. Renderer tests cover independent parts, fixed pools, reset/disposal and six-enemy-to-two-hand transitions.

Ten seeded scripted runs (five controlled heroes in both modes) complete the entire post-Crown route with all five heroes alive. Seed 123: trial combat 114.05–123.70 seconds; god combat 229.95–261.85 seconds, plus the fixed 66 seconds of descent and collapse. Reported combat seconds exclude the 60-second rest and six-second collapse. This is scripted simulation evidence, not a human balance study.

The Figma board was visually reviewed. The managed game preview again returned connection refused in the cloud browser, so in-browser aesthetics, listening, phone ergonomics and physical controller operation remain unverified. No alternate browser path or weakened network policy was used.
