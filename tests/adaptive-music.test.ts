import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { GOD_ENRAGE_TIME, GOD_ENRAGE_WARNING } from '../game/content.ts';
import { createGame } from '../game/engine.ts';
import {
  createAdaptiveMusic, cueMix, musicCue, parseManifest, STEMS,
  type AudioParamLike, type BufferLike, type ContextLike, type FilterLike, type GainLike, type MusicCue, type OscillatorLike, type SourceLike,
} from '../components/game/adaptive-music.ts';
import { createMusicPlayer } from '../components/game/music-player.ts';

// --- Fake Web Audio: records parameter automation and source scheduling. ---
class Param implements AudioParamLike {
  value: number;
  log: { op: string; value: number; time: number; tau?: number }[] = [];
  constructor(value: number) { this.value = value; }
  setValueAtTime(value: number, time: number) { this.value = value; this.log.push({ op: 'set', value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.log.push({ op: 'ramp', value, time }); return this; }
  setTargetAtTime(value: number, time: number, tau: number) { this.value = value; this.log.push({ op: 'target', value, time, tau }); return this; }
  cancelScheduledValues(time: number) { this.log.push({ op: 'cancel', value: NaN, time }); return this; }
  last() { return [...this.log].reverse().find(entry => entry.op !== 'cancel'); }
}
class Node { targets: unknown[] = []; connect(target: unknown) { this.targets.push(target); return target; } disconnect() { this.targets = []; } }
class Gain extends Node implements GainLike { gain = new Param(1); }
class Filter extends Node implements FilterLike { type = 'lowpass'; frequency = new Param(350); gain = new Param(0); Q = new Param(1); }
class Osc extends Node implements OscillatorLike { type = 'sine'; frequency = new Param(440); started = false; start() { this.started = true; } stop() { this.started = false; } }
class Source extends Node implements SourceLike {
  buffer: BufferLike | null = null; loop = false; loopStart = 0; loopEnd = 0; onended: (() => void) | null = null;
  startedAt: number | null = null; offset = 0; stoppedAt: number | null = null;
  start(when = 0, offset = 0) { this.startedAt = when; this.offset = offset; }
  stop(when = 0) { this.stoppedAt = when; }
  end() { this.onended?.(); }
}
class Buffer implements BufferLike {
  duration: number; name: string;
  constructor(duration: number, name: string) { this.duration = duration; this.name = name; }
}

const nameOf = (s: Source) => (s.buffer as Buffer | null)?.name ?? '';

class Context implements ContextLike {
  currentTime = 0; state = 'suspended'; destination = new Node();
  gains: Gain[] = []; filters: Filter[] = []; sources: Source[] = []; oscillators: Osc[] = [];
  resumes = 0; suspends = 0; closed = false;
  decodeFail = false;
  async resume() { this.resumes++; this.state = 'running'; }
  async suspend() { this.suspends++; this.state = 'suspended'; }
  async close() { this.closed = true; this.state = 'closed'; }
  createGain() { const g = new Gain(); this.gains.push(g); return g; }
  createBiquadFilter() { const f = new Filter(); this.filters.push(f); return f; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createOscillator() { const o = new Osc(); this.oscillators.push(o); return o; }
  async decodeAudioData(data: ArrayBuffer) {
    if (this.decodeFail) throw new Error('bad data');
    const name = new TextDecoder().decode(data);
    return new Buffer(DURATIONS[name] ?? 10, name);
  }
}

const MANIFEST = {
  version: 1, title: 'Siege', tempo: 72, beatSeconds: 60 / 72, barSeconds: 240 / 72,
  intro: { file: 'intro.mp3', seconds: 29.2862 },
  loop: { files: { drums: 'loop.drums.mp3', bass: 'loop.bass.mp3', other: 'loop.other.mp3' }, bars: 24, seconds: 80, loopStart: .833333, loopEnd: 80.833333 },
  victory: { file: 'victory.mp3', seconds: 32.1 }, defeat: { file: 'defeat.mp3', seconds: 13.33 }, files: {},
};
const DURATIONS: Record<string, number> = { 'intro.mp3': 29.2862, 'loop.drums.mp3': 81.667, 'loop.bass.mp3': 81.667, 'loop.other.mp3': 81.667, 'victory.mp3': 32.1, 'defeat.mp3': 13.33, 'full.mp3': 164.7 };

function fakeFetch(options: { manifest?: unknown; fail?: (url: string) => boolean } = {}) {
  const requests: string[] = [];
  const fetch = async (url: string) => {
    requests.push(url);
    const file = url.slice(url.lastIndexOf('/') + 1);
    if (options.fail?.(url)) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    if (file === 'manifest.json') return { ok: true, status: 200, json: async () => options.manifest ?? MANIFEST, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new TextEncoder().encode(file).buffer as ArrayBuffer };
  };
  return { fetch, requests };
}

function engine(options: Parameters<typeof fakeFetch>[0] = {}) {
  const ctx = new Context();
  const net = fakeFetch(options);
  const events: string[] = [];
  const media = createAdaptiveMusic({ manifestUrl: '/audio/siege/manifest.json', fallbackUrl: '/audio/full.mp3', createContext: () => ctx, fetch: net.fetch, lookahead: .03 });
  for (const type of ['waiting', 'playing', 'pause', 'error']) media.addEventListener(type, () => events.push(type));
  return { ctx, media, events, requests: net.requests };
}


// ---------------------------------------------------------------- cues

test('kernel state selects the cue; the front screen always gets the calm bed', () => {
  const trial = createGame('trial');
  assert.equal(musicCue(trial, 'play'), 'title');
  assert.equal(musicCue(trial, 'front'), 'title');
  trial.status = 'fighting';
  assert.equal(musicCue(trial, 'play'), 'battle');
  assert.equal(musicCue(trial, 'front'), 'title');
  trial.boss.phase = 2; assert.equal(musicCue(trial, 'play'), 'fractured');
  trial.boss.phase = 3; assert.equal(musicCue(trial, 'play'), 'eclipse');
  trial.boss.cast = { abilityId: 'collapse', name: 'Coherence Collapse', kind: 'raid', x: 0, z: 0, radius: 100, angle: 0, total: 10, remaining: 5 };
  assert.equal(musicCue(trial, 'play'), 'collapse');
  trial.boss.cast = null; trial.status = 'victory'; assert.equal(musicCue(trial, 'front'), 'victory');
  trial.status = 'defeat'; assert.equal(musicCue(trial, 'play'), 'defeat');

  const god = createGame('god'); god.status = 'fighting';
  god.combatTime = GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING - 1; assert.equal(musicCue(god, 'play'), 'battle');
  god.combatTime = GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING; assert.equal(musicCue(god, 'play'), 'collapse');
  const trialLate = createGame('trial'); trialLate.status = 'fighting'; trialLate.combatTime = GOD_ENRAGE_TIME;
  assert.equal(musicCue(trialLate, 'play'), 'battle', 'the trial has no collapse timer');
});

test('every cue mix is bounded and the battle states keep the drums', () => {
  for (const cue of ['title', 'battle', 'fractured', 'eclipse', 'collapse', 'victory', 'defeat'] as MusicCue[]) {
    const mix = cueMix(cue);
    for (const name of STEMS) assert.ok(mix.stems[name] >= 0 && mix.stems[name] <= 1, `${cue} ${name}`);
    assert.ok(mix.trim > 0 && mix.trim <= 1 && mix.lowpass >= 400 && mix.lowpass <= 20000 && mix.pulse >= 0 && mix.pulse <= .5);
    // The pulse modulates around the drum gain; it must not swing below silence.
    assert.ok(mix.stems.drums - mix.pulse >= 0, `${cue} pulse exceeds drum gain`);
  }
  assert.equal(cueMix('title').stems.drums, 0);
  for (const cue of ['battle', 'fractured', 'eclipse', 'collapse'] as MusicCue[]) assert.ok(cueMix(cue).stems.drums >= .7);
  assert.ok(cueMix('collapse').lowpass < cueMix('battle').lowpass && cueMix('collapse').pulse > 0);
});

test('manifest parsing rejects broken receipts', () => {
  assert.equal(parseManifest(MANIFEST).loop.bars, 24);
  assert.throws(() => parseManifest(null));
  assert.throws(() => parseManifest({ ...MANIFEST, version: 2 }));
  assert.throws(() => parseManifest({ ...MANIFEST, loop: { ...MANIFEST.loop, loopEnd: .5 } }));
  assert.throws(() => parseManifest({ ...MANIFEST, loop: { ...MANIFEST.loop, files: {} } }));
  assert.throws(() => parseManifest({ ...MANIFEST, intro: undefined }));
});

// ---------------------------------------------------------------- shipped assets

test('the shipped manifest matches its files and the loop lies on the beat grid', () => {
  const dir = new URL('../public/audio/siege/', import.meta.url);
  const raw = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  const manifest = parseManifest(raw);
  assert.equal(manifest.tempo, 72);
  assert.ok(Math.abs(manifest.barSeconds - 4 * manifest.beatSeconds) < 1e-6);
  const loopSeconds = manifest.loop.loopEnd - manifest.loop.loopStart;
  assert.ok(Math.abs(loopSeconds - manifest.loop.bars * manifest.barSeconds) < 1e-3, 'loop is a whole number of bars');
  assert.ok(Math.abs(manifest.loop.loopStart - manifest.beatSeconds) < 1e-3, 'one beat of slack before the loop point');
  assert.deepEqual(Object.keys(manifest.loop.files).sort(), [...STEMS].sort(), 'three stems shipped');
  for (const [name, receipt] of Object.entries(manifest.files)) {
    const path = new URL(name, dir);
    assert.equal(statSync(path).size, receipt.bytes, `${name} size`);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), receipt.sha256, `${name} sha256`);
  }
  for (const name of STEMS) assert.ok(Math.abs(manifest.files[manifest.loop.files[name]!].seconds - (loopSeconds + 2 * manifest.beatSeconds)) < 1e-3);
  assert.ok(manifest.files['intro.mp3'].seconds > 29 && manifest.files['intro.mp3'].seconds < 30);
  assert.equal(raw.gainDb < 0 && raw.source.truePeakDb > 0, true, 'the clipping master was pulled down');
  assert.ok(typeof raw.source.provenance === 'string' && raw.source.provenance.includes('Gemini'));
  assert.deepEqual(raw.separation.foldedIntoOther, ['vocals', 'residual']);
});

// ---------------------------------------------------------------- engine

test('first play resumes the context inside the gesture, loads stems, plays intro into a gapless loop', async () => {
  const { ctx, media, events, requests } = engine();
  assert.equal(media.paused, true);
  const playing = media.play();
  assert.equal(ctx.resumes, 1, 'resume() is called synchronously');
  await playing;
  assert.deepEqual(events, ['waiting', 'playing']);
  assert.equal(media.paused, false);
  assert.equal(media.mode, 'stems');
  assert.ok(requests.includes('/audio/siege/manifest.json') && requests.includes('/audio/siege/loop.drums.mp3'));
  assert.ok(!requests.includes('/audio/full.mp3'), 'no fallback fetch when the stems load');
  const intro = ctx.sources.find(s => nameOf(s) === 'intro.mp3')!;
  const loops = ctx.sources.filter(s => nameOf(s).startsWith('loop.'));
  assert.equal(loops.length, 3);
  for (const loop of loops) {
    assert.equal(loop.loop, true);
    assert.equal(loop.loopStart, MANIFEST.loop.loopStart); assert.equal(loop.loopEnd, MANIFEST.loop.loopEnd);
    assert.equal(loop.offset, MANIFEST.loop.loopStart, 'loop starts at its loop point, not at the slack');
    assert.ok(Math.abs(loop.startedAt! - (intro.startedAt! + MANIFEST.intro.seconds)) < 1e-9, 'loop lands on the intro\'s final downbeat');
  }
  // Title mix: drums silent, harmonic stems through the low-pass.
  const drums = ctx.gains.find(g => g.targets[0] instanceof Filter && (g.targets[0] as Filter).type === 'highshelf' && ctx.oscillators[0]?.targets.length)!;
  assert.ok(drums, 'drum gain found');
  const lowpass = ctx.filters.find(f => f.type === 'lowpass' && ctx.gains.some(g => g.targets[0] === f && g !== drums))!;
  assert.equal(lowpass.frequency.last()?.value, cueMix('title').lowpass);
  assert.equal(ctx.oscillators.length, 1); assert.ok(ctx.oscillators[0].started);
  assert.ok(Math.abs(ctx.oscillators[0].frequency.value - 2 / MANIFEST.beatSeconds) < 1e-9, 'pulse runs at two per beat');
});

test('cue changes are crossfades on the running stems; stingers land on the next beat and settle back', async () => {
  const { ctx, media } = engine();
  await media.play();
  const loopsBefore = ctx.sources.filter(s => nameOf(s).startsWith('loop.'));
  const origin = loopsBefore[0].startedAt!;
  ctx.currentTime = origin + 10.2;
  media.setCue('battle');
  const drumGain = ctx.gains.find(g => ctx.sources.some(s => nameOf(s) === 'loop.drums.mp3' && s.targets[0] === g))!;
  const last = drumGain.gain.last()!;
  assert.equal(last.op, 'target'); assert.equal(last.value, cueMix('battle').stems.drums);
  assert.equal(ctx.sources.filter(s => nameOf(s).startsWith('loop.')).length, 3, 'no new sources for a mix change');

  media.setCue('collapse');
  const depth = ctx.gains.find(g => ctx.oscillators[0].targets[0] === g)!;
  assert.equal(depth.gain.last()?.value, cueMix('collapse').pulse);

  ctx.currentTime = origin + 20.5;
  media.setCue('victory');
  const stinger = ctx.sources.find(s => nameOf(s) === 'victory.mp3')!;
  assert.ok(stinger, 'victory one-shot scheduled');
  const beat = MANIFEST.beatSeconds;
  const phase = ((stinger.startedAt! - origin) / beat) % 1;
  assert.ok(Math.min(phase, 1 - phase) < 1e-6, 'stinger starts on the beat grid');
  assert.ok(stinger.startedAt! >= ctx.currentTime + .03);
  for (const loop of loopsBefore) assert.ok(loop.stoppedAt! >= stinger.startedAt!, 'bed runs into the downbeat, then stops');
  assert.equal(media.cue, 'victory');

  // One-shot ends: the calm bed returns on new sources.
  ctx.currentTime = stinger.startedAt! + MANIFEST.victory.seconds;
  stinger.end();
  const loopsAfter = ctx.sources.filter(s => nameOf(s).startsWith('loop.') && s.stoppedAt === null);
  assert.equal(loopsAfter.length, 3, 'loop restarted after the stinger');
  assert.equal(drumGain.gain.last()?.value, cueMix('victory').stems.drums);

  // New encounter: back to battle on the loop without a stinger restart.
  ctx.currentTime += 5;
  media.setCue('battle');
  assert.equal(ctx.sources.filter(s => nameOf(s) === 'victory.mp3').length, 1, 'the one-shot is not replayed');
});

test('defeat darkens its one-shot; leaving the results cuts a running stinger short', async () => {
  const { ctx, media } = engine();
  await media.play();
  ctx.currentTime = 40;
  media.setCue('defeat');
  const stinger = ctx.sources.find(s => nameOf(s) === 'defeat.mp3')!;
  const oneShotFilter = ctx.filters.find(f => f.frequency.log.some(e => e.op === 'ramp' && e.value === 400))!;
  assert.ok(oneShotFilter, 'low-pass closes to 400 Hz over the defeat one-shot');
  const ramp = oneShotFilter.frequency.log.find(e => e.op === 'ramp' && e.value === 400)!;
  assert.ok(Math.abs(ramp.time - (stinger.startedAt! + MANIFEST.defeat.seconds)) < 1e-6);
  ctx.currentTime = stinger.startedAt! + 3;
  media.setCue('title');
  assert.ok(stinger.stoppedAt! > ctx.currentTime && stinger.stoppedAt! < ctx.currentTime + .5, 'stinger faded out quickly');
  assert.equal(ctx.sources.filter(s => nameOf(s).startsWith('loop.') && s.stoppedAt === null).length, 3);
});

test('pause suspends, play resumes without reloading; volume and mute drive the master gain', async () => {
  const { ctx, media, events, requests } = engine();
  await media.play();
  const fetched = requests.length;
  media.pause();
  assert.equal(ctx.suspends, 1); assert.equal(media.paused, true);
  await media.play();
  assert.equal(ctx.resumes, 2); assert.equal(requests.length, fetched, 'no refetch on resume');
  assert.deepEqual(events, ['waiting', 'playing', 'pause', 'playing']);
  const master = ctx.gains.find(g => g.targets[0] === ctx.destination)!;
  media.volume = .4; assert.equal(master.gain.last()?.value, .4);
  media.muted = true; assert.equal(master.gain.last()?.value, 0);
  media.muted = false; assert.equal(master.gain.last()?.value, .4);
  media.dispose();
  assert.equal(ctx.closed, true);
});

test('a pause during loading aborts the play (AbortError) instead of starting later', async () => {
  const { ctx, media } = engine();
  const pending = media.play();
  media.pause();
  await assert.rejects(pending, (e: Error) => e.name === 'AbortError');
  assert.equal(ctx.sources.length, 0, 'nothing started');
  assert.equal(media.paused, true);
});

test('missing manifest or stem falls back to the single full track; decode failure reports error 3', async () => {
  const noManifest = engine({ fail: url => url.endsWith('manifest.json') });
  await noManifest.media.play();
  assert.equal(noManifest.media.mode, 'single');
  assert.ok(noManifest.requests.includes('/audio/full.mp3'));
  const only = noManifest.ctx.sources;
  assert.equal(only.length, 1); assert.equal(only[0].loop, true); assert.equal(only[0].loopEnd, DURATIONS['full.mp3']);
  noManifest.media.setCue('battle'); noManifest.media.setCue('victory');
  assert.equal(noManifest.ctx.sources.length, 1, 'no stingers without the manifest');

  const noStem = engine({ fail: url => url.endsWith('loop.bass.mp3') });
  await noStem.media.play();
  assert.equal(noStem.media.mode, 'single');

  const broken = engine();
  broken.ctx.decodeFail = true;
  await assert.rejects(broken.media.play());
  assert.equal(broken.media.error?.code, 3);
  assert.ok(broken.events.includes('error'));
  assert.ok(!broken.requests.includes('/audio/full.mp3'), 'a codec the browser cannot decode is not retried as a full track');
});

test('the music player drives the adaptive media like an audio element', async () => {
  const { ctx, media } = engine();
  const player = createMusicPlayer();
  player.attachAudio(media);
  assert.equal(ctx.resumes, 0, 'attaching never bypasses the gesture');
  player.unlockMusic();
  assert.equal(ctx.resumes, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.getSnapshot().status, 'playing');
  player.setVolume(.5);
  const master = ctx.gains.find(g => g.targets[0] === ctx.destination)!;
  assert.equal(master.gain.last()?.value, .5);
  player.pauseMusic();
  assert.equal(player.getSnapshot().status, 'paused'); assert.equal(ctx.suspends, 1);
  player.setVisibility(true); player.setVisibility(false);
  assert.equal(player.getSnapshot().playing, false, 'an explicit pause survives a visibility round trip');
});

