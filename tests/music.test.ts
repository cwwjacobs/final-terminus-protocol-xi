import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusicPlayer, type MusicMedia } from '../components/game/music-player.ts';
import { MUSIC_SOURCE, normalizeMusicSettings } from '../components/game/music-settings.ts';

class Media extends EventTarget implements MusicMedia {
  volume = 1; muted = false; loop = false; preload = 'auto'; paused = true;
  error: { code: number } | null = null;
  plays = 0; pauses = 0; loads = 0;
  reject: Error | null = null;
  pending: Promise<void> | null = null;
  play() {
    this.plays++;
    if (this.reject) return Promise.reject(this.reject);
    if (this.pending) return this.pending;
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() { this.pauses++; this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.loads++; this.error = null; }
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('music settings bound volume, reject malformed types and retain explicit silence', () => {
  assert.deepEqual(normalizeMusicSettings(null), { enabled: true, muted: false, volume: .3 });
  assert.deepEqual(normalizeMusicSettings({ enabled: false, muted: true, volume: 0 }), { enabled: false, muted: true, volume: 0 });
  assert.equal(normalizeMusicSettings({ volume: 8 }).volume, 1);
  assert.equal(normalizeMusicSettings({ volume: -8 }).volume, 0);
  for (const volume of [NaN, Infinity, '1', null]) assert.equal(normalizeMusicSettings({ volume }).volume, .3);
  assert.deepEqual(normalizeMusicSettings({ enabled: 'yes', muted: 1, volume: .5, token: 'ignored' }), { enabled: true, muted: false, volume: .5 });
  assert.equal(MUSIC_SOURCE, '/audio/siege-of-the-gilded-hall.mp3');
});

test('attaching the supplied track does not autoplay; gesture unlock reports actual playback', async () => {
  const media = new Media(), player = createMusicPlayer();
  player.attachAudio(media);
  assert.equal(media.plays, 0);
  assert.equal(media.loop, true); assert.equal(media.preload, 'none');
  assert.equal(media.volume, .3);
  assert.equal(player.getSnapshot().playing, false);
  player.unlockMusic();
  await settle();
  assert.equal(media.plays, 1);
  assert.equal(player.getSnapshot().playing, true);
  assert.equal(player.getSnapshot().status, 'playing');
});

test('explicit pause persists, backgrounding resumes only enabled music and preserves mute/volume', async () => {
  const saved: unknown[] = [], media = new Media(), player = createMusicPlayer(settings => saved.push(settings));
  player.attachAudio(media);
  player.restoreSettings({ enabled: true, muted: true, volume: .15 });
  player.unlockMusic(); await settle();
  player.setVisibility(true);
  assert.equal(player.getSnapshot().playing, false);
  const before = media.plays;
  player.setVisibility(false); await settle();
  assert.equal(media.plays, before + 1);
  assert.equal(media.muted, true); assert.equal(media.volume, .15);
  player.pauseMusic();
  assert.deepEqual(saved.at(-1), { enabled: false, muted: true, volume: .15 });
  player.setVisibility(true); player.setVisibility(false); player.unlockMusic(); await settle();
  assert.equal(media.plays, before + 1, 'menu actions and tab changes must not undo an explicit pause');
  assert.equal(player.getSnapshot().playing, false);
  player.startMusic(); await settle();
  assert.equal(media.plays, before + 2);
  assert.equal(media.muted, true);
});

test('stored paused intent and late preference hydration never override a user action', async () => {
  const media = new Media(), player = createMusicPlayer();
  player.attachAudio(media);
  player.restoreSettings({ enabled: false, muted: true, volume: .2 });
  player.unlockMusic(); await settle();
  assert.equal(media.plays, 0);
  player.startMusic(); await settle();
  player.restoreSettings({ enabled: false, muted: false, volume: 1 });
  assert.equal(player.getSnapshot().enabled, true);
  assert.equal(player.getSnapshot().muted, true);
  assert.equal(player.getSnapshot().volume, .2);
  const firstGesture = createMusicPlayer(), firstMedia = new Media();
  firstGesture.attachAudio(firstMedia); firstGesture.unlockMusic(); await settle();
  firstGesture.restoreSettings({ enabled: false, muted: true, volume: 0 });
  assert.equal(firstGesture.getSnapshot().playing, true, 'late preference effects cannot contradict the first playback gesture');
});

test('browser autoplay rejection does not claim music is playing and explicit Play can recover', async () => {
  const media = new Media(), player = createMusicPlayer();
  media.reject = Object.assign(new Error('gesture required'), { name: 'NotAllowedError' });
  player.attachAudio(media); player.unlockMusic(); await settle();
  assert.equal(player.getSnapshot().playing, false);
  assert.equal(player.getSnapshot().status, 'blocked');
  assert.match(player.getSnapshot().error!, /Play music/);
  media.reject = null;
  player.startMusic(); await settle();
  assert.equal(player.getSnapshot().playing, true);
  assert.equal(player.getSnapshot().error, null);
});

test('pending playback cannot resurrect music after pause, hide or element replacement', async () => {
  for (const stop of ['pause', 'hide', 'detach'] as const) {
    let resolve!: () => void;
    const media = new Media(), player = createMusicPlayer();
    media.pending = new Promise<void>(done => { resolve = done; });
    player.attachAudio(media); player.startMusic();
    assert.equal(player.getSnapshot().status, 'loading');
    assert.equal(player.getSnapshot().playing, false);
    if (stop === 'pause') player.pauseMusic();
    if (stop === 'hide') player.setVisibility(true);
    if (stop === 'detach') player.attachAudio(null);
    resolve(); await settle();
    assert.equal(player.getSnapshot().playing, false, stop);
    assert.equal(media.paused, true, stop);
  }
});

test('decode/load failures stay nonblocking and Retry reloads the existing media element', async () => {
  const media = new Media(), player = createMusicPlayer();
  player.attachAudio(media); player.startMusic(); await settle();
  media.error = { code: 3 }; media.dispatchEvent(new Event('error'));
  assert.equal(player.getSnapshot().status, 'error');
  assert.equal(player.getSnapshot().playing, false);
  assert.match(player.getSnapshot().error!, /decoded/);
  const plays = media.plays;
  player.unlockMusic(); await settle();
  assert.equal(media.plays, plays, 'unrelated menu gestures do not repeatedly retry a broken track');
  player.retryMusic(); await settle();
  assert.equal(media.loads, 1);
  assert.equal(player.getSnapshot().playing, true);
  assert.equal(player.getSnapshot().error, null);
});

test('volume/mute controls do not unpause music; detached elements no longer publish events', async () => {
  const media = new Media(), replacement = new Media(), player = createMusicPlayer(() => { throw Error('storage disabled'); });
  player.attachAudio(media); player.pauseMusic();
  player.setVolume(.8); player.setMuted(true); await settle();
  assert.equal(media.volume, .8); assert.equal(media.muted, true); assert.equal(media.plays, 0);
  player.setVolume(NaN); assert.equal(media.volume, .8);
  player.attachAudio(replacement);
  assert.equal(replacement.volume, .8); assert.equal(replacement.muted, true);
  media.error = { code: 2 }; media.dispatchEvent(new Event('error'));
  assert.equal(player.getSnapshot().error, null);
  player.startMusic(); await settle();
  assert.equal(replacement.plays, 1); assert.equal(media.plays, 0);
});
