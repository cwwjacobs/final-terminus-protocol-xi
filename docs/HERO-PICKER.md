# Hero choice and main menu

The home menu exposes **Choose hero** before **Play solo**, and **Controls & keybinds** directly above Settings and How to play. The hero button displays the saved preferred hero; a resumable encounter separately names its current hero.

`MainMenu` receives `selectedHeroSlot` for new-run preference and `slot` for the actual player in the current encounter or room. `onSlot` updates the preference; `onRoomHero` requests an authoritative lobby hero change. Menu presentation does not assign room slots itself.

`HeroPicker` reads names, sigils, colors, roles, traits and abilities from the existing combat registries. The standalone hero page, solo setup, host setup and collapsible join preference use the same picker. Join explains that a taken preferred hero falls back to an available place.

In a ready lobby, **Choose hero** uses the actual room slot as its selection. Other connected players and reconnect reservations disable their hero cards. A player's own hero stays available. During or after an encounter, the menu asks the host to prepare the next run before hero changes. The room service remains responsible for enforcing availability and one player per hero.

The translucent menu stays within 520px on normal displays. On smaller or shorter screens, only its content scrolls; Back, Leave party and the footer actions remain outside that content area. Hero cards use native buttons with explicit accessible names, and the existing dialog keyboard/controller navigation includes them.

## Independent review — 2026-10-24

Verdict: no material findings within the hero-selection and control-mapper scope. Source review covered preferred-hero create/join fallback, authenticated ready-only changes, occupied and reconnect-reserved denial, host authority and session/sequence/receipt transfer, CAS contention, client revision/session guards, input/camera rebinding, saved preference versus Resume, and role-specific mappings with custom-binding preservation.

The reviewer independently ran `node --experimental-strip-types --test --test-isolation=none tests/rooms.test.ts tests/input.test.ts tests/kit-ui.test.ts tests/room-sync.test.ts`: 84 tests passed, none failed. All ten file hashes and byte lengths in the loop 3 receipt matched the current files before this documentation-only review append. The retained integrated test/build logs agree with the receipt's 252 passing tests and completed production build; the receipt also records a passing typecheck and command exit 0.

This review establishes code and automated-test coverage. It does not verify physical phones/controllers, 3D rendering in the browser without WebGL, or simultaneous live browser clients. Publication remains a separate step; this review does not seal the loop.
