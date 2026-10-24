# Menu, rooms and music

The title offers Play solo, Host a party (1–5 players), Join a party, resume/reconnect when available, Controls, Settings and How to play. Solo setup selects a character and encounter. Local gameplay remains paused while the title or an in-game menu is open.

Host creates a server-backed room, then copies its invite code or share link from the lobby. Join accepts either. Links prefill the invite form; they do not silently join. The lobby shows five fixed character places, connected players, reconnect reservations, the current host and trusts covering open places. Only the host starts an encounter. Players can join while a room has space; server authority, capacity checks and input receipts remain in force.

The host can prepare another run from results; authenticated reset preserves occupants and credentials and clears encounter statistics. Guests return to the lobby and wait for the host. Leaving transfers host authority and frees the slot. Interrupted connections become trusts after the existing timeout, with a brief reconnect reservation. If a leave request fails, Return to menu locally provides an immediate exit while retaining the saved reconnect session. Local encounter state is kept separately when entering an online room.

Every role's normal combat controls are visible on one persistent surface per input layout. Commands is an optional manually bound legacy interface, not the default combat path. Audio uses the supplied Siege of the Gilded Hall MP3, unchanged; one player loops it after a user gesture. Music play/pause, mute and volume live in menus and persist on this device. A saved Pause remains paused. Hidden tabs pause playback, and playback/network failures expose a retry path.

Validation receipts describe automated results. Live UI, media and server-room checks must be reported separately from simulation tests. Physical controller/phone play and full 3D rendering require suitable hardware; do not claim those from mocked input tests or a WebGL-unavailable browser.
