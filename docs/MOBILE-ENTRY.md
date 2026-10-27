# Mobile entry repair

The landscape menu was reproduced at an 844 × 290 CSS-pixel viewport. The fixed-height heading and footer left the inner content area almost zero height, hiding Play, Choose hero and online choices while Settings and music remained visible. A phone's browser bars make this height realistic even when its screen is wider.

For viewports at most 600px tall, the entire panel now scrolls and its content cannot shrink. Play solo is the first new-game choice. Setup and lobby launch footers stay visible above the scrollable hero list; launch buttons are at least 48px tall. A new screen resets the previous panel scroll, and loading failures bring recovery actions into view. Portrait retains the existing bounded content layout.

Loading now has a 20-second deadline and cancellable attempt state. A failure offers Retry loading and Use lighter 3D. The lighter route keeps the current expedition and selected hero, uses Performance graphics and the existing scaffold models, skips hero and Logos GLB downloads, and prepares shaders without a parallel driver wait. Ready is reported only after preparation and an initial render. Online loading authority and the host start gate remain unchanged. Touch devices with no saved graphics preference start in Performance mode; explicit saved preferences are retained.

Verification used the actual app inside temporary same-origin 844 × 290 and 390 × 700 frames. The title → Play solo → hero selection → Start → loading path worked in both sizes. Landscape also used the explicit Mobile interface: heroes scrolled above the visible Start button. Lighter 3D visibly selected Performance and Original scaffold, preserving Hecate as the controlled hero. The temporary review route was removed before publication.

`tests/scene-loading.test.ts` covers successful and rejected preparation, a stalled load, late resolution, cancellation, and a pre-cancelled attempt. The cloud browser has no WebGL, so it verified failure recovery and layout, not a physical phone's GPU or rendered combat.
