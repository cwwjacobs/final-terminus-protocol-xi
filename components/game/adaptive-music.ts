import { GOD_ENRAGE_TIME, GOD_ENRAGE_WARNING } from '../../game/content.ts';
import type { GameState } from '../../game/types.ts';
import type { MusicMedia } from './music-player.ts';

/** Adaptive playback of the supplied track, cut into stems by
 * scripts/audio/build-music.py and described by public/audio/siege/manifest.json.
 *
 * The kernel state picks a cue; the cue picks a mix (per-stem gains, a low-pass
 * on the harmonic stems, a presence shelf, a pulse on the drums). The three loop
 * stems always run in sync on one AudioContext; only their gains move, so every
 * transition is a crossfade inside one bar. Victory and defeat interrupt the loop
 * on the next beat with one-shots cut from the same recording, then settle back
 * to the calm title bed.
 *
 * This object satisfies the music player's `MusicMedia` surface, so Astra's
 * player, hook and controls (gesture unlock, pause, mute, volume, visibility,
 * retry) drive it unchanged. Without Web Audio, or when the manifest or a stem
 * cannot be fetched, it plays the single full track like the <audio> element did. */

export type MusicCue = 'title' | 'battle' | 'fractured' | 'eclipse' | 'collapse' | 'victory' | 'defeat';
export type StemName = 'drums' | 'bass' | 'other';
export const STEMS: readonly StemName[] = ['drums', 'bass', 'other'];
export const MUSIC_MANIFEST = '/audio/siege/manifest.json';

export interface MusicManifest {
  version: 1;
  title: string;
  tempo: number;
  beatSeconds: number;
  barSeconds: number;
  intro: { file: string; seconds: number };
  loop: { files: Partial<Record<StemName | 'mix', string>>; bars: number; seconds: number; loopStart: number; loopEnd: number };
  victory: { file: string; seconds: number };
  defeat: { file: string; seconds: number };
  files: Record<string, { bytes: number; sha256: string; seconds: number }>;
}

/** Which cue the authoritative state asks for. `screen` is the presentation's
 * only input: a front view (title, lobby, results) always gets the calm bed. */
export function musicCue(state: Pick<GameState, 'status' | 'mode' | 'combatTime' | 'boss'>, screen: 'front' | 'play'): MusicCue {
  if (state.status === 'victory') return 'victory';
  if (state.status === 'defeat') return 'defeat';
  if (screen === 'front' || state.status !== 'fighting') return 'title';
  if (state.boss.cast?.abilityId === 'collapse') return 'collapse';
  if (state.mode === 'god' && state.combatTime >= GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING) return 'collapse';
  if (state.boss.phase >= 3) return 'eclipse';
  if (state.boss.phase === 2) return 'fractured';
  return 'battle';
}

export interface CueMix {
  stems: Record<StemName, number>;
  /** Low-pass cutoff (Hz) on bass + other; 20000 is open. */
  lowpass: number;
  /** High shelf gain (dB) at 3 kHz on the whole bed. */
  shelf: number;
  /** Drum gain modulation depth at two pulses per beat; 0 is steady. */
  pulse: number;
  /** Overall bed level under the user's volume. */
  trim: number;
}

const MIXES: Record<MusicCue, CueMix> = {
  title: { stems: { drums: 0, bass: .55, other: .85 }, lowpass: 2600, shelf: 0, pulse: 0, trim: .8 },
  battle: { stems: { drums: .85, bass: 1, other: 1 }, lowpass: 20000, shelf: 0, pulse: 0, trim: 1 },
  fractured: { stems: { drums: 1, bass: 1, other: 1 }, lowpass: 20000, shelf: 0, pulse: 0, trim: 1 },
  eclipse: { stems: { drums: 1, bass: 1, other: 1 }, lowpass: 20000, shelf: 2.5, pulse: 0, trim: .95 },
  collapse: { stems: { drums: .7, bass: 1, other: .6 }, lowpass: 1100, shelf: 2, pulse: .3, trim: 1 },
  // After the one-shot, the bed returns quietly under the results.
  victory: { stems: { drums: 0, bass: .55, other: .85 }, lowpass: 2600, shelf: 0, pulse: 0, trim: .6 },
  defeat: { stems: { drums: 0, bass: .4, other: .7 }, lowpass: 1600, shelf: 0, pulse: 0, trim: .45 },
};

export function cueMix(cue: MusicCue): CueMix {
  return MIXES[cue];
}

/** Cues that interrupt the loop with a one-shot before settling. */
export const STINGER_CUES: Partial<Record<MusicCue, 'victory' | 'defeat'>> = { victory: 'victory', defeat: 'defeat' };

export function parseManifest(raw: unknown): MusicManifest {
  const m = raw as Record<string, unknown> | null;
  const num = (value: unknown, name: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`manifest ${name} invalid`);
    return value;
  };
  if (!m || typeof m !== 'object' || m.version !== 1) throw new Error('manifest version unsupported');
  const section = (key: 'intro' | 'victory' | 'defeat') => {
    const s = m[key] as Record<string, unknown> | undefined;
    if (!s || typeof s.file !== 'string') throw new Error(`manifest ${key} missing`);
    return { file: s.file, seconds: num(s.seconds, `${key}.seconds`) };
  };
  const loop = m.loop as Record<string, unknown> | undefined;
  if (!loop || !loop.files || typeof loop.files !== 'object') throw new Error('manifest loop missing');
  const files = loop.files as Record<string, unknown>;
  const loopFiles: MusicManifest['loop']['files'] = {};
  for (const key of [...STEMS, 'mix'] as const) if (typeof files[key] === 'string') loopFiles[key] = files[key] as string;
  if (!Object.keys(loopFiles).length) throw new Error('manifest loop has no files');
  const loopStart = num(loop.loopStart, 'loop.loopStart'), loopEnd = num(loop.loopEnd, 'loop.loopEnd');
  if (loopEnd <= loopStart) throw new Error('manifest loop points reversed');
  return {
    version: 1,
    title: typeof m.title === 'string' ? m.title : '',
    tempo: num(m.tempo, 'tempo'), beatSeconds: num(m.beatSeconds, 'beatSeconds'), barSeconds: num(m.barSeconds, 'barSeconds'),
    intro: section('intro'), victory: section('victory'), defeat: section('defeat'),
    loop: { files: loopFiles, bars: num(loop.bars, 'loop.bars'), seconds: num(loop.seconds, 'loop.seconds'), loopStart, loopEnd },
    files: (m.files && typeof m.files === 'object' ? m.files : {}) as MusicManifest['files'],
  };
}

// --- The slice of Web Audio this module touches, so tests can fake it. ---
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(value: number, time: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}
export interface AudioNodeLike { connect(target: AudioNodeLike | AudioParamLike): unknown; disconnect(): void }
export interface GainLike extends AudioNodeLike { gain: AudioParamLike }
export interface FilterLike extends AudioNodeLike { type: string; frequency: AudioParamLike; gain: AudioParamLike; Q: AudioParamLike }
export interface BufferLike { readonly duration: number }
export interface SourceLike extends AudioNodeLike {
  buffer: BufferLike | null; loop: boolean; loopStart: number; loopEnd: number; onended: (() => void) | null;
  start(when?: number, offset?: number): void; stop(when?: number): void;
}
export interface OscillatorLike extends AudioNodeLike { type: string; frequency: AudioParamLike; start(when?: number): void; stop(when?: number): void }
export interface ContextLike {
  readonly currentTime: number; readonly state: string; readonly destination: AudioNodeLike;
  resume(): Promise<void>; suspend(): Promise<void>; close(): Promise<void>;
  createGain(): GainLike; createBiquadFilter(): FilterLike; createBufferSource(): SourceLike; createOscillator(): OscillatorLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
}
export interface FetchLike { (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }> }

export interface AdaptiveMusicOptions {
  manifestUrl?: string;
  /** Single full track, played whole when the manifest or a stem is unavailable. */
  fallbackUrl: string;
  createContext?: () => ContextLike;
  fetch?: FetchLike;
  /** Seconds of scheduling lookahead for quantized starts. */
  lookahead?: number;
}

export const supportsAdaptiveMusic = () => typeof globalThis !== 'undefined' && typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'function';

interface Loaded {
  /** 'stems' when at least one separated stem loaded; 'single' plays one mixed loop. */
  kind: 'stems' | 'single';
  manifest: MusicManifest | null;
  intro: BufferLike | null;
  loop: Partial<Record<StemName | 'mix', BufferLike>>;
  loopStart: number;
  loopEnd: number;
  victory: BufferLike | null;
  defeat: BufferLike | null;
}

class AbortError extends Error { constructor() { super('aborted'); this.name = 'AbortError'; } }

const MIX_TAU = .45;        // gain/filter time constant: a change settles inside a bar at 72 BPM
const STINGER_FADE = .25;   // when a stinger is cut short

/** Media-shaped adaptive engine. One per page; attach it to the music player. */
export interface AdaptiveMusicMedia extends MusicMedia {
  setCue(cue: MusicCue): void;
  readonly cue: MusicCue;
  readonly mode: 'idle' | 'stems' | 'single';
  dispose(): void;
}

export function createAdaptiveMusic(options: AdaptiveMusicOptions): AdaptiveMusicMedia {
  const manifestUrl = options.manifestUrl ?? MUSIC_MANIFEST;
  const lookahead = options.lookahead ?? .03;
  const doFetch: FetchLike = options.fetch ?? ((url: string) => fetch(url));
  const makeContext = options.createContext ?? (() => new (globalThis as unknown as { AudioContext: new () => ContextLike }).AudioContext());
  const events = new EventTarget();

  let ctx: ContextLike | null = null;
  let loading: Promise<Loaded> | null = null;
  let loaded: Loaded | null = null;
  let cue: MusicCue = 'title';
  let volume = 1, muted = false, paused = true, disposed = false, started = false;
  let error: { code: number } | null = null;
  let token = 0;

  // Graph (built once per start)
  let master: GainLike | null = null, trim: GainLike | null = null, shelf: FilterLike | null = null, lowpass: FilterLike | null = null;
  let oneShotGain: GainLike | null = null, oneShotFilter: FilterLike | null = null;
  let lfo: OscillatorLike | null = null, lfoDepth: GainLike | null = null;
  const stemGains = new Map<StemName | 'mix', GainLike>();
  let loopSources: SourceLike[] = [];
  let loopOrigin = 0;           // context time at which loop position == loopStart (beat grid origin)
  let stinger: { source: SourceLike; kind: 'victory' | 'defeat' } | null = null;
  let introSource: SourceLike | null = null;

  const emit = (type: string) => events.dispatchEvent(new Event(type));
  const now = () => ctx?.currentTime ?? 0;

  const applyMaster = () => {
    if (!master || !ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : volume, now(), .02);
  };

  const fail = (code: number) => { error = { code }; paused = true; emit('error'); };

  async function fetchBuffer(context: ContextLike, url: string): Promise<BufferLike> {
    const response = await doFetch(url);
    if (!response.ok) throw Object.assign(new Error(`${url}: HTTP ${response.status}`), { code: 2 });
    const bytes = await response.arrayBuffer();
    try { return await context.decodeAudioData(bytes); } catch (e) { throw Object.assign(new Error(`${url}: decode failed`), { code: 3, cause: e }); }
  }

  async function loadSingle(context: ContextLike): Promise<Loaded> {
    const buffer = await fetchBuffer(context, options.fallbackUrl);
    return { kind: 'single', manifest: null, intro: null, loop: { mix: buffer }, loopStart: 0, loopEnd: buffer.duration, victory: null, defeat: null };
  }

  async function load(context: ContextLike): Promise<Loaded> {
    let manifest: MusicManifest;
    try {
      const response = await doFetch(manifestUrl);
      if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
      manifest = parseManifest(await response.json());
    } catch {
      return loadSingle(context);
    }
    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    const want: [string, string][] = [['intro', manifest.intro.file], ['victory', manifest.victory.file], ['defeat', manifest.defeat.file]];
    for (const name of STEMS) if (manifest.loop.files[name]) want.push([`loop:${name}`, manifest.loop.files[name]!]);
    if (!want.some(([key]) => key.startsWith('loop:')) && manifest.loop.files.mix) want.push(['loop:mix', manifest.loop.files.mix]);
    let buffers: BufferLike[];
    try {
      buffers = await Promise.all(want.map(([, file]) => fetchBuffer(context, base + file)));
    } catch (e) {
      if ((e as { code?: number }).code === 3) throw e;   // the same codec would fail for the fallback too
      return loadSingle(context);
    }
    const byKey = new Map(want.map(([key], i) => [key, buffers[i]]));
    const loop: Loaded['loop'] = {};
    for (const name of STEMS) if (byKey.has(`loop:${name}`)) loop[name] = byKey.get(`loop:${name}`);
    const kind = Object.keys(loop).length ? 'stems' : 'single';
    if (kind === 'single') loop.mix = byKey.get('loop:mix');
    return { kind, manifest, intro: byKey.get('intro') ?? null, loop, loopStart: manifest.loop.loopStart, loopEnd: manifest.loop.loopEnd,
      victory: byKey.get('victory') ?? null, defeat: byKey.get('defeat') ?? null };
  }

  function buildGraph(context: ContextLike) {
    master = context.createGain(); master.gain.value = muted ? 0 : volume; master.connect(context.destination);
    trim = context.createGain(); trim.connect(master);
    shelf = context.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = 0; shelf.connect(trim);
    lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = .5; lowpass.connect(shelf);
    oneShotFilter = context.createBiquadFilter(); oneShotFilter.type = 'lowpass'; oneShotFilter.frequency.value = 20000; oneShotFilter.Q.value = .5; oneShotFilter.connect(shelf);
    oneShotGain = context.createGain(); oneShotGain.gain.value = 1; oneShotGain.connect(oneShotFilter);
    stemGains.clear();
    for (const name of Object.keys(loaded?.loop ?? {}) as (StemName | 'mix')[]) {
      const gain = context.createGain(); gain.gain.value = 0;
      // Drums keep their transients: straight to the shelf. Harmonic stems take the low-pass.
      gain.connect(name === 'drums' ? shelf : lowpass);
      stemGains.set(name, gain);
    }
    const drums = stemGains.get('drums');
    if (drums) {
      lfo = context.createOscillator(); lfo.type = 'sine';
      lfo.frequency.value = 2 / beatSeconds();
      lfoDepth = context.createGain(); lfoDepth.gain.value = 0;
      lfo.connect(lfoDepth); lfoDepth.connect(drums.gain); lfo.start();
    }
  }

  function applyMix(at: number, immediate = false) {
    const mix = cueMix(cue);
    const set = (param: AudioParamLike, value: number) => {
      param.cancelScheduledValues(at);
      if (immediate) param.setValueAtTime(value, at); else param.setTargetAtTime(value, at, MIX_TAU);
    };
    for (const [name, gain] of stemGains) set(gain.gain, name === 'mix' ? 1 : mix.stems[name as StemName]);
    if (lowpass) set(lowpass.frequency, mix.lowpass);
    if (shelf) set(shelf.gain, mix.shelf);
    if (trim) set(trim.gain, mix.trim);
    if (lfoDepth) set(lfoDepth.gain, mix.pulse);
  }

  const beatSeconds = () => loaded?.manifest?.beatSeconds ?? .5;
  /** Beat-grid time at or after `after`. */
  const nextBeat = (after: number) => {
    const beat = beatSeconds();
    return loopOrigin + Math.ceil((after - loopOrigin) / beat - 1e-6) * beat;
  };

  function startLoop(context: ContextLike, at: number) {
    stopLoop(at);
    const sources: SourceLike[] = [];
    if (!loaded) return;
    for (const [name, gain] of stemGains) {
      const buffer = loaded.loop[name]; if (!buffer) continue;
      const source = context.createBufferSource();
      source.buffer = buffer; source.loop = true; source.loopStart = loaded.loopStart; source.loopEnd = loaded.loopEnd;
      source.connect(gain); source.start(at, loaded.loopStart); sources.push(source);
    }
    loopOrigin = at;
    loopSources = sources;
  }

  /** Stop at `at`; the nodes release themselves once they end so a scheduled fade is heard. */
  function stopLoop(at: number) {
    for (const source of loopSources) {
      source.onended = () => source.disconnect();
      try { source.stop(at); } catch { source.disconnect(); }
    }
    loopSources = [];
  }

  function endStinger(at: number) {
    if (!stinger || !oneShotGain) return;
    const current = stinger; stinger = null;
    current.source.onended = null;
    oneShotGain.gain.cancelScheduledValues(at);
    oneShotGain.gain.setValueAtTime(1, at);
    oneShotGain.gain.linearRampToValueAtTime(0, at + STINGER_FADE);
    try { current.source.stop(at + STINGER_FADE); } catch { /* finished */ }
    if (oneShotFilter) { oneShotFilter.frequency.cancelScheduledValues(at); oneShotFilter.frequency.setValueAtTime(20000, at); }
  }

  function playStinger(context: ContextLike, kind: 'victory' | 'defeat') {
    const buffer = loaded?.[kind];
    if (!buffer || !oneShotGain || !oneShotFilter) return;
    const at = nextBeat(now() + lookahead);
    // Fade the bed out into the downbeat the stinger lands on.
    for (const gain of stemGains.values()) { gain.gain.cancelScheduledValues(now()); gain.gain.setTargetAtTime(0, now(), (at - now()) / 3 + .01); }
    stopLoop(at + .05);
    const source = context.createBufferSource();
    source.buffer = buffer; source.loop = false; source.connect(oneShotGain);
    oneShotGain.gain.cancelScheduledValues(now()); oneShotGain.gain.setValueAtTime(1, now());
    oneShotFilter.frequency.cancelScheduledValues(now()); oneShotFilter.frequency.setValueAtTime(20000, now());
    if (kind === 'defeat') {
      // The hall closes in: the one-shot darkens over its length.
      oneShotFilter.frequency.setValueAtTime(8000, at);
      oneShotFilter.frequency.linearRampToValueAtTime(400, at + buffer.duration);
    }
    if (trim) { trim.gain.cancelScheduledValues(at); trim.gain.setValueAtTime(1, at); }
    source.onended = () => {
      if (stinger?.source !== source || disposed) return;
      stinger = null;
      // Settle: the calm bed returns under the results.
      const t = now() + lookahead;
      startLoop(context, t);
      applyMix(t, true);
      for (const gain of stemGains.values()) { gain.gain.setValueAtTime(0, t); }
      applyMix(t + .01);
    };
    source.start(at);
    stinger = { source, kind };
  }

  function teardown() {
    stopLoop(now()); endStinger(now());
    try { introSource?.stop(); } catch { /* not started */ }
    introSource = null;
    try { lfo?.stop(); } catch { /* already stopped */ }
    lfo = null; lfoDepth = null;
    master?.disconnect(); master = null; trim = null; shelf = null; lowpass = null; oneShotGain = null; oneShotFilter = null;
    stemGains.clear();
  }

  function begin(context: ContextLike) {
    buildGraph(context);
    const t = now() + lookahead;
    const want = STINGER_CUES[cue];
    if (loaded?.intro && loaded.manifest && !want) {
      // First arrival: the intro leads into the loop on its downbeat.
      introSource = context.createBufferSource();
      introSource.buffer = loaded.intro; introSource.connect(oneShotGain!);
      introSource.start(t);
      startLoop(context, t + loaded.manifest.intro.seconds);
      introSource.onended = () => { introSource = null; };
    } else startLoop(context, t);
    applyMix(t, true);
    if (want) playStinger(context, want);
    started = true;
  }

  const media: AdaptiveMusicMedia = {
    get volume() { return volume; },
    set volume(value: number) { volume = Math.max(0, Math.min(1, Number(value) || 0)); applyMaster(); },
    get muted() { return muted; },
    set muted(value: boolean) { muted = !!value; applyMaster(); },
    loop: true,
    preload: 'none',
    get paused() { return paused; },
    get error() { return error; },
    get cue() { return cue; },
    get mode() { return loaded ? loaded.kind : 'idle'; },
    addEventListener: (type, callback) => events.addEventListener(type, callback),
    removeEventListener: (type, callback) => events.removeEventListener(type, callback),

    async play() {
      if (disposed) throw new AbortError();
      const identity = ++token;
      try { ctx ??= makeContext(); } catch { fail(4); throw new Error('Web Audio unavailable'); }
      const context = ctx;
      // Inside the user's gesture; the promise may settle later.
      const resumed = context.resume().catch(() => undefined);
      if (started) {
        await resumed;
        if (identity !== token) throw new AbortError();
        paused = false; emit('playing'); return;
      }
      emit('waiting');
      try {
        loading ??= load(context);
        loaded = await loading;
      } catch (e) {
        loading = null;
        if (identity !== token) throw new AbortError();
        fail((e as { code?: number }).code ?? 2);
        throw e;
      }
      await resumed;
      if (identity !== token) throw new AbortError();
      begin(context);
      error = null; paused = false; emit('playing');
    },
    pause() {
      token++;
      paused = true;
      if (ctx && started) void ctx.suspend().catch(() => undefined);
      emit('pause');
    },
    load() {
      // Retry: forget buffers and the graph; the next play() fetches again.
      token++;
      error = null;
      teardown();
      loading = null; loaded = null; started = false; paused = true;
    },
    setCue(next: MusicCue) {
      if (next === cue) return;
      const previous = cue;
      cue = next;
      if (!ctx || !started || disposed) return;
      const want = STINGER_CUES[next];
      const t = now();
      if (want) { if (stinger?.kind !== want) playStinger(ctx, want); return; }
      if (stinger || STINGER_CUES[previous]) {
        // Leaving the results: cut the one-shot and bring the loop back on the new mix.
        endStinger(t);
        startLoop(ctx, t + STINGER_FADE);
        for (const gain of stemGains.values()) gain.gain.setValueAtTime(0, t + STINGER_FADE);
        applyMix(t + STINGER_FADE + .01);
        return;
      }
      applyMix(t);
    },
    dispose() {
      if (disposed) return;
      disposed = true; token++;
      teardown();
      void ctx?.close().catch(() => undefined);
      ctx = null; loaded = null; loading = null; started = false;
    },
  };
  return media;
}
