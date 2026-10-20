# Controls revision — verification

Corey's first-play feedback drives this milestone: correct movement and camera directions, Tab cycling including a single enemy, configurable hotkeys, camera orbit/pitch/framing/zoom, and optional inversion disabled by default. The combat kernel, lore, room protocol, and encounter balance are unchanged.

## Mechanism checks

All 66 tests pass, including regressions for camera-relative strafe signs, camera independence from idle actor facing, full-orbit wrapping, bounded pitch/distance, target cycling, keyboard chord conflicts, safe settings normalization, default-off inversion, and focus/menu suppression. A controllable Gamepad API harness verifies both sticks, configurable buttons, zoom mapping, and neutral-before-resume behavior. These harness tests are not physical-controller testing.

Independent review caught interactive links capturing gameplay keys and a floating-point movement component of 1.0000000000000002 that the strict multiplayer API would reject. Both were corrected and have regression coverage. TypeScript, full ESLint and the production build pass. The existing client bundle size warning remains an initial-download optimization target.

A separate source-only copy installed all 692 locked packages with `npm run install:ci`, then passed typecheck, lint, all 66 tests and the production build. No node_modules, build output or neighboring project was copied into that verification folder. All newly referenced local modules and existing React/Three imports resolve through those checks; dependency/load-path status: OK. No dependency versions changed.

## Actual browser checks

At 1280×720, Tab selects Crown Resonance; repeated Tab and Shift+Tab retain and pulse the single target. Menu Tab navigates controls. Rebinding Next target to T updates the visible hint and T selects the target. Capturing Shift+Tab swaps the previous Tab binding without accidentally binding Shift alone. Controller button selection changes the displayed mapping.

The six inversion options start unchecked. Mouse vertical inversion, camera height 1.6, shoulder offset 0.1 and the T binding survive a full reload. The defaults button restores non-inverted controls and standard bindings. Mouse drag visibly orbits horizontally and vertically; scrolling up zooms in. Looking around remains independent of stationary actor facing. Settings and remapping operate without triggering combat actions.

Browser inspection identified lower-body occlusion by the hotbar at shorter viewport heights; the renderer now applies a bounded projection adjustment on resize. It measures the actual console position, leaving camera input semantics and combat coordinates unchanged.

With the actual Three projection, default feet move from y469.25 to y432 at 1280×720, clearing the dock by 18px; browser inspection confirms visible feet. At 1625×901 the offset is zero and projected feet remain y587.21. Browser error logs were empty during the local controls checks.

## Boundaries and remaining work

- Physical gamepad hardware and five-device WAN play are unverified. Gamepad menu navigation remains a future feature.
- The arena currently contains one enemy. Multi-target wrap logic is tested with several candidate IDs; multiple live enemies are not implemented by this controls revision.
- This is an orbiting third-person camera with height, shoulder position and zoom. Camera collision and unrestricted flying-camera roll are not implemented.
- Control preferences save per browser/origin; they do not transfer between localhost and the hosted Site.
- Current rendering remains procedural. Rich combat effects and improved visual telegraphs are future art/gameplay work.

Source and release receipts accompany the milestone separately so this document does not claim an unpublished build is live.
