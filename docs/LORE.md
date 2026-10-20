# Terminus Q Protocol — current story and adaptation boundaries

This document records the story decisions used by **Final Terminus Protocol XI**. Corey's explicit revision in the current project takes precedence over the older ordinary-human origin in `canon_v1.5.md`. The underlying source archive remains unchanged.

## Current origin: the amnesiac guardians

Zeus is literally Zeus. Ariadne, Bacchus, Dolos and Hecate are gods whom Zeus made amnesiac to serve as guardians of the **Middle Plane**. Their apparent ordinary-human origin in the earlier canon is superseded by this explicit revision.

When they descend into the lower plane, the **Quantum Realm**, their godhood emerges to protect the realm. They instinctively recognize that something is wrong. This does not require their personal memories to return all at once: **the power remembers before the minds do** is the current dramatic interpretation of that emergence.

Their instinct detects a disturbance; it does not automatically identify a villain, explain the cause, or supply a cure. Protecting the Middle Plane and protecting the Quantum Realm can become competing duties. Divine power does not remove the need for observation, learning or moral judgment.

**Continuity preserved:** exactly four figures originally descend—Ariadne, Bacchus, Dolos and Hecate. The playable party has five active roles, including Heracles. His point of entry, what he knows, and how he joins remain open. Five active party slots do not establish five original descenders.

This revision changes the protagonists' origin and the resulting interpretation of Logos's evidence. It does not wholesale adopt the scenario treatment's Department of Baseline Integrity, Pompeii explanation, missing Low-Guard timetable, civilian biographies, conditioning, or a particular Heracles entrance. Those remain source proposals unless Corey selects them.

## Logos and the real uncertainty

The setting is literally quantum scale within the fiction. It is not a normal-sized fantasy world with a quantum backdrop, and its fictional physics are not claims about demonstrated real physics.

Logos is a native coherent consciousness. His understanding of the Higher Realm physically shapes the geography around him: his cosmology becomes landscape. He has coherence without complete knowledge. He is not a machine, a malicious program, or a generic evil god.

Under the revised origin, **Logos correctly recognizes the protagonists as gods**. His error no longer rests on misidentifying ordinary humans with divine field names. What remains incomplete is his account of the Higher Realm and his inference about ascent. Their downward crossing is compelling evidence that a boundary can be crossed; it does not prove that he can reverse that passage, explain its requirements, or establish that doing so is safe.

His mistake remains understandable. Accurate recognition of who arrived can coexist with a mistaken explanation of how their journey works.

The Nameless remain native quantum patterns or beings whose transition into persistent larger-scale existence is unresolved. No model, size class, animation rig or combat label settles their ontology as robots, golems, souls, failed humans, or demons.

## Current five-role direction

| Figure | Current gameplay direction | Visual direction used here |
| --- | --- | --- |
| Bacchus | Physical close DPS, polearm | Thyrsus-inspired polearm and a forward physical silhouette |
| Heracles | Tank, shout/roar, stun and frontline disruption | Broad protective silhouette; final art and entrance remain open |
| Dolos | Physical ranged precision, mobility and deception | Recurve bow, shooting stance and narrow silhouette |
| Hecate | Quantum caster | Orbital motifs and elemental burst effects |
| Ariadne | Healer and support | Smooth, protective coherent light |

The older audit's Bacchus-as-tank mapping is historical. The later five-role direction places Heracles in the tank role and Bacchus in polearm DPS. That class change does not erase character relationships.

### Ariadne and Bacchus

The supplied historical lore audit preserves Corey's Ariadne/Bacchus romantic direction: intense, mutual attachment, with recklessness and protective instinct around one another. Its reproduced user wording is “i did mean Bacchus i want the tank and healer to yolo lovo each othero”. This is retained as **recovered relationship direction**, following the named people rather than permanently binding them to their old combat classes.

The audit is a secondary reconstruction with incomplete original source identifiers. It is not a newly verified original conversation. No new marriage history, civilian identity, relationship scene, or mythology-derived biography is established here. How their relationship interacts with amnesia and recovering godhood remains available for Corey to develop.

## Encounter adaptation: Crown Resonance at Crowned Horizon

The current encounter draws its name and visual direction from the supplied Episode 1 scenario treatment:

- **Crowned Horizon:** a great luminous concavity and an annular arena beneath incomplete golden arcs reaching toward an apex that never meets.
- **Crown Resonance:** a threshold manifestation of floating, asymmetrical crystalline fragments and satellite cores, with violet displacement signaling disturbance. The treatment describes it as an immune response of Logos's architectural mind. It is **not Logos himself**.

These names replace the prototype invention “Hollow Regent”. The game is a focused encounter adaptation, not an implementation of every scene or every numeric specification in the treatment. Its combat balance, arena dimensions, actions and mechanics are defined by the current game modules.

The procedural model is a **replaceable boss scaffold**. Its disconnected cores, asymmetrical satellites and halo support the encounter's scale and targeting readability. They do not establish a robotic species, fixed anatomy, or a final authored skin. The party figures are also replaceable procedural art. `components/game/actors.ts` preserves animation handles so authored GLB assets can replace them without changing combat rules.

## Two independent states and the moral cost

Healthy coherence appears as smooth, adaptive, fluid light. Disturbance appears as irregular electrical snapping and spatial displacement. More electricity does not mean healthier coherence or greater divinity.

**Environment stability and entity coherence are independent.** A quiet arena can contain an incomplete witness; a coherent being can stand in a disturbed environment. Defeating an encounter, clearing its hazards, or turning off an effect must not silently imply that every inhabitant has become whole.

The current combat prototype uses HP and combat state; it does not yet implement separate narrative simulation values for environmental stability and each entity's coherence. Its graphics and victory state must therefore be read as encounter presentation, not proof that the realm or its inhabitants have been healed.

Extinguishing Logos's consciousness may also destroy the world it sustains. The larger story's moral cost remains unresolved. Victory over Crown Resonance neither kills Logos nor proves a consequence-free cure, a guaranteed rescue, or a settled ending. The guardians' emerging divinity makes their responsibility more difficult; it does not provide an automatic moral solution.

## Source ledger

| Source | Use and limit |
| --- | --- |
| Corey's current project revision: gods made amnesiac by Zeus as Middle Plane guardians, godhood emerging in the Quantum Realm to protect it | Current origin decision; overrides ordinary-human origin and its dependent misidentification claim |
| `/home/operator/Music/GEM/TQP/lore_and_canon/source_reference/terminus_q_skill/canon_v1.5.md` | Continuing baseline for literal scale, Logos's causal cosmology, unresolved Nameless, independent states and moral cost; origin clauses superseded as described above |
| `/home/operator/Music/GEM/TQP/lore_and_canon/lore/SCENARIO_TREATMENT_EPISODE_1.md` | Source for Crown Resonance / Crowned Horizon and role/art vocabulary; broader agency history, biographies, exact staging and numbers are not automatically adopted |
| `/home/operator/Music/GEM/TQP/lore_and_canon/lore/02_characters_and_roles.md` and `design/03_gameplay_class_direction.md` | Later five-role direction, Bacchus's polearm, Heracles's tank behavior and unresolved entry |
| `/home/operator/Music/GEM/TQP/lore_and_canon/design/01_visual_language.md` and `design/02_asset_system_architecture.md` | Coherent light, disturbance, state independence, and separation of identity, scaffold, skin, size and narrative role |
| `/home/operator/Music/GEM/TQP/lore_and_canon/lore/TERMINUS_Q_HISTORICAL_LORE_DEEP_DIVE.md`, section 3.1 and dialogue excerpt 3 | Recovered Ariadne/Bacchus relationship direction; secondary evidence with incomplete original provenance |

Future story changes should update this document and visible in-game copy together. A renderer change alone must not rewrite the story.
