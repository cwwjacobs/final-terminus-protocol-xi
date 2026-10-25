# Music

The supplied **Siege of the Gilded Hall** MP3 is served at `/audio/siege-of-the-gilded-hall.mp3`. The source bytes are copied unchanged. One rendered `<audio>` element loops the track across title, lobby, combat and results; screen changes do not create extra players or restart the music.

`useGameMusic()` exposes `audioRef`, playback state, `unlockMusic`, Play/Pause, mute, volume and retry controls. Render one audio element with that ref, the `MUSIC_SOURCE` URL, `loop` and `preload="none"`. Call `unlockMusic()` synchronously from trusted Play/Solo/Create/Join gestures. It respects a stored explicit pause; use `startMusic()` only for the explicit Play music button.

Music defaults to 10% volume and waits for a user gesture. A one-time quiet-music migration caps older stored volumes at 10%, preserving quieter settings, mute and pause. Subsequent user adjustments persist. Hiding the document pauses playback; returning resumes only when the player had music enabled and already unlocked audio. A browser autoplay rejection leaves the UI paused with a Play music prompt. Load/decode failures offer Retry music without blocking the game. Mute/volume changes do not unpause music.

`MusicControls` uses ordinary buttons plus a native range input so keyboard, controller menu navigation and touch can share the same controls. Compact placement shows Play/Pause and Mute; the full Settings placement also shows the track name and volume slider. The hook reports actual media playback instead of treating a play request as success.

Combat effects have a separate persistent volume control, initially 35%. `useCombatAudio()` consumes the same deduplicated presentation event stream as the visuals. This pass adds original synthesized thunder, static discharge and two healing cues. It does not add a complete attack/status sound library. Healing ticks are silent; resets and stale events do not replay cues. A single gesture-unlocked AudioContext, bounded voices and hidden-tab silence keep playback contained. Music controls affect music only; setting effects volume to zero silences combat cues.

Mock-media tests cover music playback intent, browser rejection, visibility changes, retry and in-flight request cancellation. Event mapping tests cover combat cue selection. Audible mix and mobile browser gesture policies still require real-browser/device checks.
