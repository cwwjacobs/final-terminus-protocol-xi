# Compact game interface and exit flow

The translucent glass styling remains. This revision reduces occupied screen area and makes every result/menu escapable.

## Flow

- Start encounter → play → compact results → Play again or Back to start.
- Results also have a visible Close button and Escape / controller B. Closing preserves the completed arena and leaves a small Results / Back to start bar.
- Dead combat buttons and the party roster disappear after an encounter ends.
- Escape / controller Menu opens the game menu. Local combat pauses while a menu is open; online combat continues and says so explicitly.
- Resume/Close returns to the arena. Nested menus have Back; Escape/B follows the same hierarchy. Returning to start during an active local fight requires an in-game confirmation.
- Online results expose Leave party directly. Failed leave requests preserve the session and report the failure; they never silently reset the room.
- Tab stays inside dialogs; controller D-pad/left stick moves focus, A activates, B backs out. Left/right adjusts selected settings. Menu is fixed to standard button 9 unless that button already has an explicit saved gameplay remap.

## Separate layouts

| Preset | Presentation |
| --- | --- |
| PC | Compact resource/command strip, optional short horizontal ability bar, compact party health, combat log off initially. Keyboard shortcuts and mouse controls remain available. |
| Mobile | Touch movement and thumb-sized action controls; desktop hotbar and roster stay hidden. Menus/results have visible touch exits and viewport-bounded panels. |
| Controller | Separate primary-ability cards with current button bindings, command/resource strip, stronger focus indication, fixed menu navigation context. |
| Automatic | Switches between the three interfaces using the most recently detected input. |

The selected override persists on this device. Choose it in Menu → Settings → Interface layout, or Menu → Controls & layout. Keyboard and gamepad bindings remain separately configurable. No global CSS scaling is used, so touch targets remain usable.

## References

- [Final Fantasy XIV: input-specific HUD layouts](https://na.finalfantasyxiv.com/uiguide/know/faq-display/control_type_layout.html)
- [Xbox Accessibility Guideline 112: consistent UI navigation and Back](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)

## Verification limits

Automated checks cover layout selection, Escape and controller Menu/A/B/D-pad routing, neutral/release gating, form behavior and suppression of combat behind menus. Physical controller hardware and real mobile-device checks are still required. The managed preview route was unavailable to the QA browser; production UI checks are performed after publication. No fixture/debug route is shipped.
