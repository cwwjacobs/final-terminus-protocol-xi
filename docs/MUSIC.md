# Music

The supplied **Siege of the Gilded Hall** MP3 is served at `/audio/siege-of-the-gilded-hall.mp3`. The source bytes are copied unchanged. One rendered `<audio>` element loops the track across title, lobby, combat and results; screen changes do not create extra players or restart the music.

`useGameMusic()` exposes `audioRef`, playback state, `unlockMusic`, Play/Pause, mute, volume and retry controls. Render one audio element with that ref, the `MUSIC_SOURCE` URL, `loop` and `preload="none"`. Call `unlockMusic()` synchronously from trusted Play/Solo/Create/Join gestures. It respects a stored explicit pause; use `startMusic()` only for the explicit Play music button.

Music defaults to 10% volume and waits for a user gesture. A one-time quiet-music migration caps older stored volumes at 10%, preserving quieter settings, mute and pause. Subsequent user adjustments persist. Hiding the document pauses playback; returning resumes only when the player had music enabled and already unlocked audio. A browser autoplay rejection leaves the UI paused with a Play music prompt. Load/decode failures offer Retry music without blocking the game. Mute/volume changes do not unpause music.

`MusicControls` uses ordinary buttons plus a native range input so keyboard, controller menu navigation and touch can share the same controls. Compact placement shows Play/Pause and Mute; the full Settings placement also shows the track name and volume slider. The hook reports actual media playback instead of treating a play request as success.

Combat effects have a separate persistent volume control, initially 35%. `useCombatAudio()` consumes the same deduplicated presentation event stream as the visuals. Original Web Audio synthesis covers weapons, elemental spells, healing, wards, thunder, defensive actions and nonverbal pain reactions. War Cry has its own low brass/percussive cue. Ground-wave warnings have a separate rising cue, so they remain audible without a boss cast and do not interrupt its sustained charge. Phase/descent/awakening transitions, victory and defeat have distinct cues. Healing and burn ticks remain silent; restored history is never replayed.

One gesture-unlocked AudioContext feeds a gentle compressor and the user's effects volume. Voices, queued contacts and per-frame playback are bounded. The audio frame scheduler wakes only when contacts are queued, and pause/hidden/reset/unmount cancels pending playback. Interrupted contexts retry on a fresh gesture. Music controls still affect music only; setting effects volume to zero immediately stops effects.

Mock-media tests cover music playback intent, browser rejection, visibility changes, retry and in-flight request cancellation. Event and mock Web Audio tests cover cue selection, concurrent warnings, compression wiring, voice limits, mute, visibility, interrupted-context recovery and cleanup. Audible mix and mobile browser gesture policies still require real-browser/device checks.
