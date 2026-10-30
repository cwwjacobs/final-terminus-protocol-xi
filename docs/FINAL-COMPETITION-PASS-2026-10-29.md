# Final competition pass — 29 October 2026

This pass prioritizes performance and reliability, then makes the last Logos encounter progressively lose its arena. It builds on published version 33 (`9f8416d27ab30c7a498ac50e6ca65ab425ad2b4c`).

## Final fight

- The giant begins on the existing 24-unit platform. As his remaining coherence falls, its radius recedes toward 11 units: approximately 79% of the original ground area disappears. The six opening statues' 12% health transfer does not immediately shrink the floor.
- Recession is capped at 0.65 units/second, below the heroes' 6-unit walking speed. Bursts cannot instantly remove the floor under a player. The remaining edge confines living heroes, fallen heroes, dodges and Critical Dash return points.
- Head and hands move inward proportionally. New statues spawn inside the surviving platform. Existing cast telegraphs stay committed to their original ground position. Companions find a sideways escape when a radial escape would run into the edge.
- Two edge-loss warnings, a ground-remaining indicator, a fractured rim and a fixed pool of falling stones build pressure. Three brief synthesized crumble cues cover the warnings and final collapse. Reduced motion retains a static edge without tumbling fragments.
- The existing six-second floor collapse, hero fall and escape still follow Logos's defeat. The saved arena radius survives this transition; it does not expand before the ending.
- Trial/God health budgets remain 360,000/660,000. Geometry and target access provide the new pressure and late area-attack opportunities; no unsupported health inflation was added. The God warning now uses the same giant-stage clock as its deadline.

## Reliability and performance

- Valid ground-shard targets previously failed the room request parser. The parser now derives accepted IDs from the authored wave schedule. Permanent 400/413/422 packet failures release only that packet; uncertain transient failures retain sequence identity for safe retry.
- Idle dark-statue particles no longer rewrite matrices and colors. At high quality, 60 idle frames previously performed 11,520 matrix writes and 11,520 color writes; both are now zero. One active trail writes 1,440 matrices instead of 11,520. Empty floating-number slots avoid 1,440 redundant opacity writes over the same interval.
- Two 900-frame replays per quality retained identical visible-behavior digests. The Node helper microprofile saved approximately 0.05 ms/update on this machine. These are bounded helper measurements, not a claim of whole-game FPS improvement.
- New arena accents add at most three draws and 208/360 triangles in low/high quality, with fixed pools of 8/16 chunks. Hidden stages, unchanged snapshots and reduced motion avoid chunk-buffer updates.
- Guide controls now follow role-specific custom keyboard/controller mappings and Heracles's transformed kit. Crown victory focuses the authorized **Descend to Logos** action. Up to three short dismissible contextual tips use existing UI snapshots.
- Touch movement is passed as an explicit shared ref; cleanup listeners and room polling callbacks have stable dependencies. Removed unused code/geometry and tightened test fixture types.

## Validation

Run the repository checks:

```sh
npm test
npm run typecheck
npm run build
npm run lint
node --experimental-strip-types scripts/verify-logos-encounters.mjs --matrix --full-game --ready-up
```

The active matrix covers five controlled heroes × two modes × five fixed seeds, playing Crown, descent, opening statues, giant waves and the ending. All 50 runs won with five surviving heroes and reached the inner platform. Every sampled save validated/restored. Logos combat times were 141–155.25 seconds in Trial and 239.10–276.60 seconds in God; these exclude descent and the final collapse. Minimum party health across these scripted active runs was 72.1% in Trial and 67.0% in God. They establish reproducibility and viability, not human difficulty calibration.

Independent controls, repeated with identical outcome/state hashes: all five humans idle after trust-led opening statues lost in all ten cases; one idle human plus four trusts won all 25 Trial cases. In God, idle Bacchus/Heracles/Hecate cases won; idle Dolos/Ariadne cases lost. Trial deliberately permits substantial companion support. The controls also caught the corrected warning-clock mismatch.

Independent review passed 85 targeted checks and 122,550 sampled circle-escape configurations. It reviewed persistence, dash cancellation/return, target geometry, committed warnings, ending transitions, pooled resources and packet recovery.

The local HTTP integration used two real clients and local D1: create/join, load gate, host-only start, bad-packet rejection then accepted fresh sequence, duplicate protection, trust timeout/reconnect and a real ground target shared across both clients all passed. The initial empty local database was migrated using the existing schema; production data was untouched.

Browser walkthrough covered title/setup/loading, painted hero assets, keyboard spells/guard/ranged attacks, switching controlled heroes, Crown result focus, ready-up descent, statue/giant stages and the visibly shrinking platform. The final browser result showed victory at 4:12 and the party's escape; the exact six-second fall animation was verified by tests rather than frame-by-frame observation. Portrait 390×844 and landscape 844×390 layouts were inspected; the portrait document fit its viewport with all five models loaded and zero model failures. A development reload preserved the late encounter for Resume. The final browser warning/error log was empty.

Failed receipts were retained: three isolated ultimate tests exposed an anchor-position overwrite, corrected by proportional movement; the matrix caught an audio-warning metadata/save mismatch, corrected by an explicit event kind. After the final code cleanup, all 497 tests, type checking, the production build and all 50 full-game matrix runs passed. Lint reported zero errors and four existing native-image guidance warnings. The external release receipt binds these checks to the packaged and released source commit.

## Limits

No physical-phone, Safari, physical-controller, simultaneous multi-device browser, production load, GPU profiler or subjective listening certification is claimed. Local HTTP proves the endpoint path, not a browser's automatic retry under real packet loss. Displayed FPS is an observation from this desktop session, not a cross-device guarantee. The release receipt records exact source/version/deployment identity separately from this source report.
