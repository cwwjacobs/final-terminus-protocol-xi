#!/usr/bin/env python3
"""Cut the supplied track into adaptive-music assets with a receipt.

Input: the mastered stereo track (MP3/WAV) and, optionally, Demucs stems of the
same file. Output: `public/audio/siege/` holding

  intro.mp3               bars [0, loopBar)            one-shot, ends on the loop's downbeat
  loop.<stem>.mp3         bars [loopBar-1 beat, loopEnd+1 beat]   one file per stem, loop
                          points one beat inside each end so decoder padding cannot
                          touch the seam
  victory.mp3             bars [victoryBar, end)        one-shot
  defeat.mp3              bars [defeatBar, defeatEnd)   one-shot, 1.5 s fade baked in
  manifest.json           grid, section bounds, loop points, gain, SHA-256 per file

The grid is a fixed tempo and first-downbeat offset (measured once with
scratch tooling: librosa beat tracking, least-squares fit of the downbeats).
Every cut lands on that grid, so a section boundary is a downbeat and the loop
length is an exact number of bars. One gain brings the mix's 4x-oversampled
true peak to --true-peak dBTP; the same gain goes on every stem so the stems
still sum to the mix.

Stems: `--stems DIR` with drums/bass/other/vocals.wav (Demucs htdemucs output
for the same source, 44.1 kHz). Without stems, `--separate` runs
`python -m demucs` (CPU is fine, ~3 min for 3 minutes of audio). Without
either, the loop ships as a single `loop.mix.mp3` and the runtime falls back
to a one-stem mix.

Needs ffmpeg (libmp3lame) on PATH and numpy, soundfile, scipy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

DEMUCS_STEMS = ('drums', 'bass', 'other', 'vocals')
# Shipped stems. Demucs's vocals (near-silent on an instrumental) and its
# reconstruction residual are folded into `other`, so the three sum to the mix exactly.
STEMS = ('drums', 'bass', 'other')


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def decode(path: Path) -> tuple[np.ndarray, int]:
    """Decode anything ffmpeg reads to float32 stereo at its native rate."""
    if path.suffix.lower() in ('.wav', '.flac'):
        data, sr = sf.read(path, dtype='float32', always_2d=True)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / 'decoded.wav'
            run(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-c:a', 'pcm_f32le', str(wav)])
            data, sr = sf.read(wav, dtype='float32', always_2d=True)
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    return data, sr


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def true_peak_db(x: np.ndarray, oversample: int = 4) -> float:
    up = resample_poly(x, oversample, 1, axis=0)
    return 20 * np.log10(max(np.abs(up).max(), 1e-12))


def separate(source: Path, out: Path) -> Path:
    run([sys.executable, '-m', 'demucs', '-n', 'htdemucs', '-d', 'cpu', '-o', str(out), str(source)])
    return out / 'htdemucs' / source.stem


def encode_mp3(data: np.ndarray, sr: int, dest: Path, kbps: int) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'cut.wav'
        sf.write(wav, data, sr, subtype='FLOAT')
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', f'{kbps}k',
             '-joint_stereo', '1', '-write_xing', '1', str(dest)])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source', required=True, type=Path, help='mastered track (mp3/wav)')
    ap.add_argument('--stems', type=Path, help='directory holding drums/bass/other/vocals.wav for the source')
    ap.add_argument('--separate', action='store_true', help='run Demucs htdemucs on the source first')
    ap.add_argument('--out', required=True, type=Path, help='output directory (public/audio/<slug>)')
    ap.add_argument('--tempo', type=float, required=True, help='beats per minute (4/4)')
    ap.add_argument('--downbeat', type=float, required=True, help='seconds to the first downbeat of the grid')
    ap.add_argument('--loop-bars', type=int, nargs=2, metavar=('START', 'END'), required=True, help='loop = grid bars [START, END)')
    ap.add_argument('--victory-bar', type=int, required=True, help='victory one-shot = bar .. end of track')
    ap.add_argument('--defeat-bars', type=int, nargs=2, metavar=('START', 'END'), required=True)
    ap.add_argument('--true-peak', type=float, default=-1.0, help='target mix true peak, dBTP')
    ap.add_argument('--stem-kbps', type=int, default=160)
    ap.add_argument('--mix-kbps', type=int, default=192)
    ap.add_argument('--title', default='')
    ap.add_argument('--provenance', default='', help='free text recorded in the manifest')
    args = ap.parse_args()

    source = args.source.resolve()
    mix, sr = decode(source)
    beat = 60 / args.tempo
    bar = 4 * beat
    n = len(mix)
    duration = n / sr

    def at(bar_index: float) -> int:
        return int(round((args.downbeat + bar_index * bar) * sr))

    peak = true_peak_db(mix)
    gain_db = args.true_peak - peak
    gain = 10 ** (gain_db / 20)
    print(f'source {source.name}: {duration:.3f}s {sr} Hz, true peak {peak:+.2f} dBTP -> gain {gain_db:+.2f} dB')

    stems: dict[str, np.ndarray] = {}
    separation_notes: dict = {}
    stems_dir = args.stems
    if args.separate and not stems_dir:
        stems_dir = separate(source, Path(tempfile.mkdtemp(prefix='demucs-')))
    if stems_dir:
        total = np.zeros_like(mix)
        for name in DEMUCS_STEMS:
            data, ssr = sf.read(stems_dir / f'{name}.wav', dtype='float32', always_2d=True)
            if ssr != sr:
                raise SystemExit(f'{name}.wav is {ssr} Hz, source is {sr} Hz')
            if abs(len(data) - n) > sr // 10:
                raise SystemExit(f'{name}.wav length {len(data)} differs from source {n}')
            data = data[:n] if len(data) >= n else np.pad(data, ((0, n - len(data)), (0, 0)))
            stems[name] = data
            total += data
        err = total - mix
        err_db = 20 * np.log10(np.sqrt((err ** 2).mean()) / max(np.sqrt((mix ** 2).mean()), 1e-12))
        vocals_db = 20 * np.log10(max(np.sqrt((stems['vocals'] ** 2).mean()), 1e-12))
        print(f'demucs stems sum to the mix within {err_db:.1f} dB (relative RMS); vocals stem {vocals_db:.1f} dBFS')
        stems['other'] = stems['other'] + stems.pop('vocals') - err
        separation_notes = {'residualDb': round(float(err_db), 2), 'vocalsDb': round(float(vocals_db), 2), 'foldedIntoOther': ['vocals', 'residual']}

    out = args.out
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    files: dict[str, dict] = {}

    def emit(name: str, data: np.ndarray, kbps: int, **meta) -> None:
        dest = out / name
        encode_mp3(np.clip(data * gain, -1, 1), sr, dest, kbps)
        files[name] = {'bytes': dest.stat().st_size, 'sha256': sha256(dest), 'seconds': round(len(data) / sr, 6), **meta}
        print(f'  {name:18s} {len(data) / sr:7.3f}s {dest.stat().st_size / 1024:7.0f} KiB')

    loop_start_bar, loop_end_bar = args.loop_bars
    pre = int(round(beat * sr))  # one beat of slack each side of the loop
    a, b = at(loop_start_bar), at(loop_end_bar)
    if a - pre < 0 or b + pre > n:
        raise SystemExit('loop slack runs off the track')

    emit('intro.mp3', mix[:a], args.mix_kbps, bars=[0, loop_start_bar])
    loop_files: dict[str, str] = {}
    if stems:
        for name in STEMS:
            emit(f'loop.{name}.mp3', stems[name][a - pre:b + pre], args.stem_kbps)
            loop_files[name] = f'loop.{name}.mp3'
    else:
        emit('loop.mix.mp3', mix[a - pre:b + pre], args.mix_kbps)
        loop_files['mix'] = 'loop.mix.mp3'
    emit('victory.mp3', mix[at(args.victory_bar):], args.mix_kbps, bars=[args.victory_bar, None])
    d0, d1 = at(args.defeat_bars[0]), at(args.defeat_bars[1])
    defeat = mix[d0:d1].copy()
    fade = int(1.5 * sr)
    defeat[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    emit('defeat.mp3', defeat, args.mix_kbps, bars=list(args.defeat_bars), fadeSeconds=1.5)

    manifest = {
        'version': 1,
        'title': args.title,
        'source': {'file': source.name, 'bytes': source.stat().st_size, 'sha256': sha256(source),
                   'seconds': round(duration, 6), 'sampleRate': sr, 'truePeakDb': round(float(peak), 3), 'provenance': args.provenance},
        'gainDb': round(float(gain_db), 3),
        'truePeakTargetDb': args.true_peak,
        'tempo': args.tempo,
        'beatSeconds': round(beat, 9),
        'barSeconds': round(bar, 9),
        'firstDownbeat': args.downbeat,
        'format': 'audio/mpeg',
        'intro': {'file': 'intro.mp3', 'seconds': files['intro.mp3']['seconds']},
        'loop': {
            'files': loop_files,
            'bars': loop_end_bar - loop_start_bar,
            'seconds': round((b - a) / sr, 6),
            'loopStart': round(pre / sr, 6),
            'loopEnd': round((pre + b - a) / sr, 6),
            'gridBars': [loop_start_bar, loop_end_bar],
        },
        'victory': {'file': 'victory.mp3', 'seconds': files['victory.mp3']['seconds']},
        'defeat': {'file': 'defeat.mp3', 'seconds': files['defeat.mp3']['seconds']},
        'files': files,
        'stems': list(stems) if stems else [],
        'separation': {'tool': 'demucs htdemucs (MIT), CPU', **separation_notes} if stems else None,
        'encoder': 'ffmpeg libmp3lame, joint stereo, Xing/LAME header',
        'build': ' '.join(['scripts/audio/build-music.py'] + [arg if ' ' not in arg else repr(arg) for arg in sys.argv[1:]]),
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    total_bytes = sum(f['bytes'] for f in files.values())
    print(f'wrote {len(files)} files, {total_bytes / 1024 / 1024:.2f} MiB, manifest {out / "manifest.json"}')
    return 0


if __name__ == '__main__':
    os.environ.setdefault('PYTHONWARNINGS', 'ignore')
    raise SystemExit(main())
