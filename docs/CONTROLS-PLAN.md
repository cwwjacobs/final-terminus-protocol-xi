# Controls revision

Corey's feedback: Tab should cycle targets even with one enemy; camera needs full spatial control and zoom; hotkeys must be configurable; inversion must be optional and off by default. Preserve the established game and modular architecture.

1. Control kernel: correct screen-relative movement, central validated/persisted bindings, independent camera intent and single/multiple-target cycling helpers. Mechanism tests first.
2. Parallel branches: input translates configured keyboard/mouse/gamepad controls; renderer consumes camera state and target markers; HUD exposes remapping and camera preferences and displays current bindings.
3. Browser checks: Tab repeatedly selects one enemy; movement direction, orbit/pitch/zoom, remapping/conflicts, inversion, persistence and menu suppression. Test/typecheck/build, save locally and GitHub, publish the existing private Site.

Exact delegated prompts:

- Input: Own control-settings.ts, input.ts and tests/input.test.ts. Implement the agreed command/settings contract, corrected camera-relative movement, configured keyboard/mouse/gamepad input, optional inversion defaulting off, target/camera command callbacks and meaningful tests. Do not edit GameClient, Scene or game/network rules.
- Camera: Own camera.ts and Scene.tsx, plus camera tests. Implement a renderer-independent bounded camera controller (yaw, pitch, zoom, height and shoulder offset), camera-relative orbit/pitch projection and recentering; consume target selection/pulse for a visible enemy marker. Preserve render pooling/disposal and combat rules. Do not edit input or GameClient.
- Review: Independently review the integrated controls against the user feedback, keyboard accessibility and online/local separation. Report concrete failures; do not broaden the game or edit files without a bounded assignment.
