# LOOP_MAP — Main-menu hero and control picker

Goal: Main menu visibly exposes Choose hero and Controls & keybinds; one hero picker shows all five characters and persists the choice. Solo and room creation use that hero; joining prefers it when available, and lobby players can choose available hero places. Controls open with input layout and active hero's hotkeys before camera options.
Kernel: Keep compact glass styling, direct role ability mappings, saved custom bindings, menu/back flow, music and scoreboard, authoritative five-slot rooms, host permission, reconnect reservations and session-token privacy.
Out of scope: Combat balance, hero models/animations, duplicate characters, matchmaking.
Authorization: User explicitly requested hero picker, main menu and hotkey mapper/control picker on the main menu. Prior GO, main synchronization and publication authorization persist.

| Loop | Goal | Allowed files | Exit check | Status |
|---|---|---|---|---|
| 3 | Deliver hero choice and discoverable controls across local/room flows | components/game/MainMenu.tsx, HeroPicker.tsx, main-menu.css, hero-picker.css, ControlsPanel.tsx, controls-panel.css, GameClient.tsx, control-settings.ts helpers if needed, lib/rooms.ts, related tests, docs/*, LOOP_MAP.md, RECEIPTS.md, GAUNTLET.md | npm test && npm run typecheck && node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs | Receipt attached: 252 tests, typecheck and production build pass; independent review complete, awaiting Operator seal |

Whole-build: command above and browser main-menu → hero picker → controls mapping → local/room hero checks where available. Independent review must check room slot transfer, host identity, stale snapshots and custom binding preservation. Hardware/3D/simultaneous-client browser limits remain explicit. Parallel tasks own separate files in one authorized loop; root integrates and publishes.

## Final competition pass — 29 October 2026

Authorization: Corey asked to “walk the build. Then audit the whole, and clean it up. Prioritize performance, then pizazz.” This authorizes the scoped implementation, repairs, review and existing Sites/GitHub release workflow below. His subsequent housekeeping message is not a pause request. Proceed within this scope without repeated permission requests; record evidence and unresolved limits.

Kernel: Preserve deterministic combat/balance, five hero identities and existing lore; room authority, save/custom-binding compatibility, reduced-motion support, public Sites hosting and secret isolation remain intact. Performance precedes added presentation. Do not add new encounters, heroes, paid assets or services.

Baseline: managed Sites source opened at 9f8416d27ab30c7a498ac50e6ca65ab425ad2b4c, saved/published version 33. Work in the reconciled work/site checkout. No new branch or worktree: root integrates disjoint delegated files and the Sites helper commits/pushes the exact reviewed source. GitHub main sync follows the prior request.

| Loop | Goal | Allowed files | Exit check | Status |
|---|---|---|---|---|
| FP1 | Walk entry, play, results, settings and rooms; establish current checks and find measured work | read-only product; outputs/final-pass-* evidence outside repo | Baseline tests/typecheck/build and observed browser/source audit | validated |
| FP2 | Reduce demonstrated rendering/UI/network waste without changing mechanics, plus the authorized arena scope below | components/game render, lifecycle, HUD/input helpers; related tests/profile scripts; room fixes only for established bugs | Meaningful regressions, before/after bounded profiles, full tests/typecheck/build | validated |
| FP3 | Correct guide bindings and route to Logos; add lightweight contextual presentation | GameClient, EncounterResult, guidance helpers/component/CSS; related tests | Role/custom-binding correctness, first-run/returning flows and responsive/reduced-motion inspection | validated |
| FP4 | Audit integrated whole, repair review findings and publish | docs final audit, receipts and scoped repairs from above; hosting/package metadata | Full checks plus browser encounter/room walkthrough; independent review; exact saved/deployed/GitHub commit | validated for release; publication identity in external receipt |

Whole-build check: npm test && npm run typecheck && npm run build, followed by live/browser entry-to-encounter, Crown-to-Logos routing, controls/settings/save and local two-client room checks as supported. Human hardware, subjective audio and broad network-load limits remain explicit. Tool/browser snapshots are not physical-phone/controller proof. Preserve failed logs. Any repair retains FP2.A/FP3.A/FP4.A with its actual scope and evidence. Independent reviewer must read final diff and receipts; root does not self-seal.

### Delegation prompts

Performance implementation: Inspect current rendering and effect lifecycle in work/site, baseline 9f8416d. Own only Scene.tsx, render-budget.ts, rendering helpers you identify, related new tests and a bounded profile script if justified. Audit first, then implement small measurable performance fixes with no combat/visual semantic change. Do not edit GameClient.tsx, EncounterResult.tsx, control-settings.ts, game engine, rooms, package manifests or existing audit docs. Retain performance-mode and reduced-motion intent. Run relevant tests and send measured before/after evidence, all limitations and exact changed files. Do not publish or commit. Follow LMCP plan/verify.

Player-flow implementation: Own GameClient.tsx, EncounterResult.tsx, role-aware guide helpers, a small contextual onboarding component/helper/CSS and related tests. Fix known Unbound guide alias bug using effective role bindings, including remaps, controller and Heracles transformed state. Make Descend to Logos receive primary focus on Crown victory (host only online). Add at most three brief dismissible contextual first-run cues for Engage/TP/chain-burst if it can remain lightweight, role-correct and unobtrusive; preserve existing tutorial as reference and all saved settings/room authority. Review source and existing patterns first; avoid combat changes and per-frame state work. Do not edit Scene/render helpers, rooms, package manifests or audit docs. Run meaningful focused tests. No publish/commit. Follow LMCP plan/verify.

Whole-system audit: Read-only independent audit of work/site rooms/API, save/restore, input/lifecycle, loading/fallback and presentation integration. Look for concrete correctness, performance and security defects relevant to a final competition pass. Ground findings in exact code; distinguish tested/source-only/unknown. Do not edit, install, commit or deploy. Give actionable high-priority findings first, then an explicit list of covered surfaces and remaining real-device risks. Root owns integration and local two-client tests. Follow LMCP plan/verify.

### Authorized scope addition and repair — final Logos fight

Corey additionally requested balancing Logos with the heroes, a progressively shrinking arena as his health drops, mounting fear of falling, and the existing collapse/fall ending after defeat. Re-scope explicitly: FP2 now permits game/logos.ts, engine.ts, types.ts/content.ts as required, persistence migrations and focused encounter/room tests. FP3 permits the corresponding Scene/Logos visual helpers and warning UI. Keep the victory/fall sequence and authoritative single-/multiplayer behavior. Define shrinking space from health with a smooth bounded radius, ensure heroes remain able to act and reach targets, preserve targeting and mechanic telegraphs, and validate all five hero roles through deterministic full encounter simulations. Numerical profiles are balance evidence, not a human playtest.

FP2.A established multiplayer repair: server selectEnemy rejects valid ground-shard IDs; the client retries malformed packets indefinitely. The system auditor now owns lib/rooms.ts and a new focused room regression test. Player-flow worker owns GameClient permanent-request-error recovery. Transient failure retries and sequence idempotence remain unchanged.

Actual delegation assignment: logos_performance handles renderer helpers; existing model_recommendation agent handles the player-flow prompt; existing frontier_contract agent handles whole-system audit and authorized FP2.A room repair. Attempts to spawn additional agents hit the tool's thread limit, so existing agents were reused. Root owns integration and final encounter changes.

### Final verification and repair record

FP1: Completed source/build/browser walkthrough and local two-client HTTP check. Baseline 464 tests passed. Existing source, GitHub main and published v33 reconciled before editing.
FP2: Completed pooled effect/DOM write reduction, ground-target/parser and permanent-retry repair, progressive arena with reachable targets and safe trust escape, persisted radius and preserved ending. Measured helper changes and bounded arena geometry recorded outside the public source tree.
FP2.B: Full-suite review caught an anchor overwrite in isolated ultimate tests; movement now scales existing positions proportionally. A matrix snapshot caught a new warning's invalid ability metadata; a dedicated arena_recede event fixes the contract. Idle controls exposed the God warning using the wrong clock; it now follows giant elapsed time with a focused regression.
FP3: Completed role-aware guide, Crown-to-Logos autofocus, bounded contextual tips, static reduced-motion rim and synthesized crumble cues. Touch ownership and poll callback dependencies cleaned up after lifecycle review.
FP4: Independent reviewer passed 85 targeted checks and 122,550 circle-escape samples. Root inspected the integrated browser build through the final victory/escape screen. After final code cleanup, 497 tests, type checking, the production build and 50 full-game balance cases passed. Lint has zero errors and four existing native-image guidance warnings. Published source must match the packaged commit and GitHub main; deployment identity is recorded in the external release receipt.

Additional delegated work: logos_performance built the bounded arena visual helper and independently ran idle balance controls; model_recommendation verified local HTTP/D1 and repaired explicit touch-ref ownership/stable polling callbacks; frontier_contract independently reviewed the final arena and saved reproducible geometry/test receipts. These tasks used the same mapped kernel and no new services, assets, paid calls or encounters.
