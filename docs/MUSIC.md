# Music

The supplied **Siege of the Gilded Hall** MP3 is served at `/audio/siege-of-the-gilded-hall.mp3`. The source bytes are copied unchanged. One rendered `<audio>` element loops the track across title, lobby, combat and results; screen changes do not create extra players or restart the music.

`useGameMusic()` exposes `audioRef`, playback state, `unlockMusic`, Play/Pause, mute, volume and retry controls. Render one audio element with that ref, the `MUSIC_SOURCE` URL, `loop` and `preload="none"`. Call `unlockMusic()` synchronously from trusted Play/Solo/Create/Join gestures. It respects a stored explicit pause; use `startMusic()` only for the explicit Play music button.

Music defaults to 30% volume and waits for a user gesture. Pause, mute and volume persist on the device. Hiding the document pauses playback; returning resumes only when the player had music enabled and already unlocked audio. A browser autoplay rejection leaves the UI paused with a Play music prompt. Load/decode failures offer Retry music without blocking the game. Mute/volume changes do not unpause music.

`MusicControls` uses ordinary buttons plus a native range input so keyboard, controller menu navigation and touch can share the same controls. Compact placement shows Play/Pause and Mute; the full Settings placement also shows the track name and volume slider. The hook reports actual media playback instead of treating a play request as success.

No combat sound effects are added by this change. Mock-media tests cover playback intent, browser rejection, visibility changes, retry and in-flight request cancellation; audible output and mobile browser gesture policies still require real-browser/device checks.
