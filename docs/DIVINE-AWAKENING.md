# Divine awakening — implementation and verification

Requested by Corey, 2026-10-25: add a ten-minute ultimate to each hero, unlock them against Logos, add Dusk, and give transformed Heracles a lightning kit. The first ultimate implementation used the existing SVG registry and Three.js. The follow-up encounter update inspected and extended the existing Figma vector kit, then integrated its articulated layers and a new seal.

## Source baseline

GitHub `main` was `d5d6a8826c8483f7795f288eba235c87a8c009a6`; Sites `main` was `6c9f565956f8579007b4672e08292e315454bb50`. Both had tree `668f4fcef269bf63a68da91520643f45d1f97530`. No main-source differences needed reconciliation before implementation. Their separate commit histories are retained.

## Playable route and decisions

Defeat Crown Resonance and choose **Descend to Logos** on Results or the compact result bar. In rooms only the host may lead this transition. The subsequent Logos encounter update restores the party for a one-minute descent and scoreboard intermission, then a six-sentinel wave. The giant rises after all six fall and unlocks the ultimates. Trial Logos has 210,000 HP; god Logos 420,000 HP, with separate 8,000 HP hand targets. Coherence loss starts a six-second floor collapse and escape before victory. See LOGOS-ENCOUNTER.md.

Ultimate cooldowns are **600 simulation seconds**, individually tracked. New balance values where Corey supplied no number are provisional: Fission 9,000 magic base; Rain of Fire 2,000 physical base with its specified 3× critical; 12m ultimate area centered on Logos; form Shock 450 magic / 45 MP / 12s recast / 8m bounce / 2s stun; Bolt 600 magic or 1,500 burst / 70 MP / 6s recast; Clap 350 × (1 + TP/3000) magic / all TP, minimum 1,000 / 12s recast / 12m area centered on Heracles / 3s stun.

Fearless charges guarantee criticals on outgoing physical and magical direct hits, not skillchain damage or burn ticks. Bacchus receives ten charges, other living heroes five. His empowered hits refill TP to 3,000; while charges remain he can close his own compatible chain. **That self-chain triggers Dusk.** Dusk lasts ten seconds, refreshes on a further qualifying self-chain, and permits every supported element to burst. It does not change ordinary chain timing or normal eight-second elemental windows.

Rejuvenator fills HP and TP for every living ally regardless of distance. Its shield uses **effective HP healed**, per recipient, and absorbs damage after mitigation. Aegis remains separate and blocks a hit before the HP shield is spent. Overhealing produces no shield; it does not resurrect fallen heroes. Existing shields may accumulate up to max HP. Shielded damage does not count as HP lost.

Rain of Fire burns each surviving hit enemy for **25% of the actual impact damage**, divided into three deterministic one-second ticks. That fixed budget is not re-scaled by later buffs, crits or bursts; overkill is excluded. Burns continue if Dolos falls, and stop when the target or encounter ends.

Thunderclap interrupts committed casts and freezes enemy activity for five seconds, including the boss. Son of Zeus has no expiry, doubles Heracles’s render root, changes his appearance to white hair/beard and a lightning-bearing robe, replaces his primary actions, and overrides each enemy’s threat target until his death. Defenses and ordinary threat are retained. The form remains visible after victory; death or a fresh encounter clears it. Raid-wide damage remains raid-wide even while Heracles is the threat target.

## Controls and presentation

Keyboard G / fresh controller L3 / touch ultimate button. Existing saved bindings are preserved; older controller layouts can keep L3 for targeting and receive an unbound-ultimate notice. Left/right D-pad still selects the enemy. Primary 1/2/3 and X/Y/RB become Lightning Shock / Bolt / Clap in Zeus form. All abilities remain available through the optional Commands menu and direct remapping.

The splitting atom has two visible nuclei, electron orbits, escaping neutrons and an expanding 12m ring. Rain uses descending fire arrows and state-driven burn flames. Rejuvenator has party waves and damage domes; Fearless has charge-counted orbiting lights. Thunderclap and Clap have expanding shock rings; Bolt has a sky strike; Shock has enemy-to-enemy arcs. Logos uses smooth dark stone with silver veins and luminous eyes. Geometry is allocated once and reused; updates do not mutate combat state. Sounds reuse the existing synthesized audio system; group recipient events and burn ticks do not multiply cast sounds.

## Verification

- `npm test`: baseline suites plus `ultimates.test.ts`, `divine-visuals.test.ts`, controller/keyboard dispatch, role/menu filtering, and network host-only descent checks.
- `npm run typecheck`.
- `node --experimental-strip-types scripts/verify-logos-encounters.mjs`: ten post-Crown checkpoint runs, all five active roles in trial and god mode. Each finished with all five heroes alive. Those timings refer to the original two-echo checkpoint. The updated verifier now covers the descent, six sentinels, giant and escape; current results are reported at release. This is scripted simulation evidence, not a human balance study.
- Production build through the Sites build helper.

The managed preview daemon returned `http://terminal.local:4173/`, but the cloud browser received connection refused and a local HTTP check timed out. Browser rendering, listening, physical controller input and phone ergonomics remain unverified in this environment. No alternative browser or changed network permissions were used. Automated renderer tests verify a visible split, state-driven model visibility, fixed geometry counts and read-only state, not aesthetic quality.

## Boundaries

This adds the requested combat unlock path and a playable Logos encounter. The follow-up encounter update implements the elevator descent, statue rush, separate giant head/hands, disappearing floor and abstract escape. A named rescuer or authored rescue cinematic remains outside this implementation; no such mechanism is invented. No account-wide progression system is introduced; an existing saved Logos expedition retains its unlock, while a fresh expedition begins at Crown Resonance. Site audience is preserved.
