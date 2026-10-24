# Music

## The track

**Siege of the Gilded Hall** — 2:45, 72.00 BPM, D♯ minor, stereo 44.1 kHz MP3 at 192 kbps. Corey generated it with Google Gemini (Lyria) and supplied it on 24 October 2026. Google's generative-AI terms claim no ownership of generated output and leave the user responsible for it; Lyria output carries an inaudible SynthID watermark, which is fine for a game but means the file is machine-identifiable as AI audio. Storefronts that ask for AI-content disclosure (Steam, itch.io) should be told. The receipt in `public/audio/siege/manifest.json` records this provenance with the source hash.

The master clips: +0.36 dBTP, −13.3 LUFS. Every derived file below is pulled down by 1.36 dB to −1 dBTP; the untouched original stays at `/audio/siege-of-the-gilded-hall.mp3` as the single-file fallback.

Structure, measured on the beat grid (first downbeat 2.6195 s, bar 3.3333 s):

| Bars | Seconds | What it is | Used as |
| --- | --- | --- | --- |
| 0–8 | 0–29.3 | rise | `intro.mp3`, plays once on first arrival and hands off to the loop on its final downbeat |
| 8–32 | 29.3–109.3 | two 12-bar phrases, the full siege | the loop: 24 bars, 80.000 s, cut per stem |
| 32–35 | 109.3–119.3 | plateau tail | not shipped |
| 35–39 | 119.3–132.6 | breakdown | `defeat.mp3` (13.3 s, 1.5 s fade baked in; the runtime closes a low-pass over it) |
| 39–end | 132.6–164.7 | wind-down and coda to silence | `victory.mp3` (32.1 s) |

## Adaptive playback

`components/game/adaptive-music.ts` runs three loop stems (drums, bass, other — Demucs `htdemucs`, MIT; its near-silent vocals stem and its −19.5 dB reconstruction residual are folded into `other`, so the three sum to the mix) in lock-step on one `AudioContext`. The kernel state picks a cue, the cue picks a mix, and only gains and two filters move, so every transition is a crossfade inside a bar:

| Cue | When (`musicCue`) | Mix |
| --- | --- | --- |
| `title` | any front view (title, lobby, results, pause menu) or `status: 'ready'` | drums off, bass .55, other .85, low-pass 2.6 kHz, −2 dB |
| `battle` | fighting, boss phase 1 | drums .85, all open |
| `fractured` | phase 2 | everything 1 |
| `eclipse` | phase 3 | +2.5 dB high shelf at 3 kHz |
| `collapse` | god mode inside the 30 s warning, or the Coherence Collapse cast | harmonic stems low-passed to 1.1 kHz, drums pulsing at two per beat |
| `victory` / `defeat` | `status` | the bed fades into the next beat, the one-shot plays, then the calm bed returns under the results |

Loop points sit one beat inside each stem file (`loopStart` 0.833 s, `loopEnd` 80.833 s) so MP3 encoder padding can never reach the seam; decoded with ffmpeg the files line up with the original to the sample (lag 0) and the intro→loop handoff reproduces the master within MP3 noise (−24 dB). Stingers start on the next beat of the loop's grid. Drums bypass the low-pass so their transients survive the calm mixes.

The engine satisfies the music player's `MusicMedia` surface, so `createMusicPlayer`, `useGameMusic`, `MusicControls` and the stored settings are unchanged: the first trusted gesture calls `play()`, which resumes the context synchronously and then loads the stems; pause suspends the context; the tab hiding pauses and showing resumes; mute and volume drive the master gain; "Retry music" drops the buffers and refetches. `GameClient` renders the `<audio>` element as the baseline and swaps in the engine after mount when `AudioContext` exists; the shell carries `data-music="<cue>"`. If the manifest or any stem fails to fetch, the engine plays the single full track in a loop as before (cues then only move the trim and low-pass). A decode failure reports `MediaError` code 3 and the controls show Retry.

Total download for the adaptive set is 6.4 MiB (three 1.6 MiB stems, intro, two one-shots), fetched after the first Play gesture, not at page load. Opus would roughly halve it once Safari's `decodeAudioData` support is confirmed on the devices we care about.

## Building the assets

```sh
python3 -m demucs -n htdemucs -d cpu -o work/audio/stems public/audio/siege-of-the-gilded-hall.mp3   # ~2 min CPU
python3 -I scripts/audio/build-music.py --source public/audio/siege-of-the-gilded-hall.mp3 \
  --stems work/audio/stems/htdemucs/siege-of-the-gilded-hall --out public/audio/siege \
  --tempo 72 --downbeat 2.6195 --loop-bars 8 32 --victory-bar 39 --defeat-bars 35 39 \
  --title "Siege of the Gilded Hall" --provenance "…"
```

`--separate` runs Demucs for you. The script fits nothing: tempo and first downbeat are inputs, measured once (librosa beat tracking, least-squares fit of 30 downbeats, residual 7 ms); every cut is a grid bar, the loop is an exact bar count, and the manifest records the grid, the gain, SHA-256 and byte size per file and the exact command. `tests/adaptive-music.test.ts` checks the shipped manifest against the files and the grid, the cue selection against kernel states, the mixes' bounds, and the engine against a fake `AudioContext` (gesture resume, intro→loop timing, crossfades, beat-quantized stingers, settle, pause/resume, abort, fallbacks, decode error) and through the real music player.

A new track means re-measuring the grid and choosing the bars; the rest is the same command.

## Still to do

- Listen on real hardware: the loop seam, the intro handoff and the collapse pulse were verified numerically and in headless Chromium (no audio device), not by ear on speakers and phones.
- Combat sound effects are not here (Kenney CC0 packs are the plan).
- Voice lines: nothing is generated yet. The line list has to be written first (lore folder); then Chatterbox or Kokoro locally, with a manifest like this one and a priority/cooldown player.
- Safari/iOS gesture and `decodeAudioData` behaviour on device.
