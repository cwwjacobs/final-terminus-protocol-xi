# Real-time QoL port

This revision adapts presentation ideas from the local Terminus Quantum: Logos Ascension `qol-camera` branch at `c0ac8ff`. XI remains the continuous third-person party game: auto attacks generate TP, weapon abilities form timed chains, magic bursts use those windows, and enmity controls the enemy's attention. The tactics game's turns, Watch, movement grid and Coherence-link damage rules are not part of this port.

The starting XI source is Sites checkpoint `8f022090804474fb18bc06dd3319ac2576714520`. It already includes painted heroes, Bacchus combat motion, engagement camera lock, HUD camera clearance and skillchain feedback. This pass builds on those systems.

## Source synchronization

The GitHub `main` inspected before this revision was `edee614c93eb553bb394ba751b707718101b9d65`. Its tree exactly matches historical Sites checkpoint `b74aff7`; the two remotes have separate commit histories. Preserve both histories when reconciling the newer Sites source with GitHub. Do not force-push or replace newer remote work.

## Presentation boundaries

- The compact command menu resolves the current role, resource and cooldown state before dispatch. The existing kernel validates every action again. Opening a command menu does not pause combat.
- Floating feedback consumes structured authoritative events. Healing now carries an optional recipient slot; legacy heal events remain loadable and do not invent a recipient. Damage, healing amounts and targeting rules are unchanged.
- A local presentation epoch identifies encounter/session replacement. Existing logs are baselined and pending effects cleared, so reconnecting does not replay historical attacks.
- Feedback uses bounded pools and the existing renderer quality settings. Reduced-motion preferences suppress decorative motion. Character asset ownership stays with the existing GLB adapter/cache.

## Verification

- All 136 automated tests pass, including command folders, input suppression, legacy bindings, event baselines, correct heal attribution, bounded number pools and existing sustained-combat/room-authority tests.
- TypeScript and the Sites production build pass. The existing large-client-chunk build warning remains.
- Production browser checks confirm that Enter opens without attacking, arrows traverse nested folders, Attack starts combat, Hecate's adversary spell dispatches and displays its confirmed damage, and combat continues while choosing. Five painted models load without asset failures.
- At 320 × 640, the command popover remains between x=21 and x=281 with no horizontal document overflow. Narrow menu anchoring was corrected after review.
- Physical controller hardware and multi-device online play were not exercised. Automated Gamepad API tests cover the implemented menu context; they do not establish hardware compatibility or network conditions.
- The development server experienced a dependency-optimization React hook failure during hot reload. The production Worker preview rendered and exercised successfully; no dependency or framework workaround was shipped.

The animation/effects acquisition and fitting recommendations are in [POLISH-SOURCES.md](POLISH-SOURCES.md). That research does not add new retargeted animation clips to the game.
