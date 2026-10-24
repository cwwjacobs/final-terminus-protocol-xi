import { normalizeMusicSettings, type MusicSettings } from './music-settings.ts';

export type MusicStatus = 'ready' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
export interface MusicSnapshot extends MusicSettings {
  playing: boolean;
  status: MusicStatus;
  error: string | null;
}

/** The small media surface used here is also supplied by HTMLAudioElement. */
export interface MusicMedia {
  volume: number;
  muted: boolean;
  loop: boolean;
  preload: string;
  readonly paused: boolean;
  readonly error: { readonly code: number } | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, callback: EventListener): void;
  removeEventListener(type: string, callback: EventListener): void;
}

/** One controller owns one rendered audio element. Intent is persisted;
 * playback is reported only after the media element actually starts. */
export function createMusicPlayer(persist?: (settings: MusicSettings) => void) {
  let state: MusicSnapshot = { ...normalizeMusicSettings(null), playing: false, status: 'ready', error: null };
  let audio: MusicMedia | null = null;
  let hidden = false, unlocked = false, interacted = false, request = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<MusicSnapshot>) => {
    const next = { ...state, ...patch };
    if (Object.keys(next).every(key => next[key as keyof MusicSnapshot] === state[key as keyof MusicSnapshot])) return;
    state = next;
    listeners.forEach(listener => listener());
  };
  const save = () => {
    try { persist?.({ enabled: state.enabled, muted: state.muted, volume: state.volume }); } catch { /* Storage can be disabled. */ }
  };
  const applySettings = () => {
    if (!audio) return;
    audio.volume = state.volume;
    audio.muted = state.muted;
    audio.loop = true;
    audio.preload = 'none';
  };
  const stop = () => {
    request++;
    audio?.pause();
    update({ playing: false, status: state.error ? state.status : state.enabled && !unlocked ? 'ready' : 'paused' });
  };
  const loadFailure = () => {
    request++;
    audio?.pause();
    const message = audio?.error?.code === 3
      ? 'The music could not be decoded. Try again or keep playing with music off.'
      : 'The music could not load. Check your connection and try again.';
    update({ playing: false, status: 'error', error: message });
  };
  const playing: EventListener = () => {
    if (!audio || !state.enabled || hidden) { audio?.pause(); return; }
    update({ playing: !audio.paused, status: audio.paused ? 'paused' : 'playing', error: null });
  };
  const paused: EventListener = () => {
    update({ playing: false, status: state.error ? state.status : state.status === 'loading' ? 'loading' : 'paused' });
  };
  const waiting: EventListener = () => {
    if (state.enabled && !hidden && audio && !audio.paused) update({ playing: false, status: 'loading' });
  };
  const failed: EventListener = () => loadFailure();
  const events: [string, EventListener][] = [['playing', playing], ['pause', paused], ['waiting', waiting], ['error', failed]];

  async function play(reload = false) {
    if (!audio || !state.enabled || hidden || !unlocked) return;
    const media = audio, identity = ++request;
    if (reload) media.load();
    applySettings();
    update({ playing: false, status: 'loading', error: null });
    try {
      // Called directly by a trusted button/key gesture, not deferred to an effect.
      await media.play();
      if (identity !== request || media !== audio || !state.enabled || hidden) return;
      update({ playing: !media.paused, status: media.paused ? 'paused' : 'playing', error: null });
    } catch (error) {
      if (identity !== request || media !== audio || !state.enabled || hidden) return;
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      if (name === 'AbortError') { update({ playing: false, status: 'paused' }); return; }
      if (name === 'NotAllowedError') {
        update({ playing: false, status: 'blocked', error: 'Press Play music to allow audio in this browser.' });
      } else loadFailure();
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    attachAudio(media: MusicMedia | null) {
      if (audio === media) return;
      request++;
      if (audio) {
        events.forEach(([name, callback]) => audio!.removeEventListener(name, callback));
        audio.pause();
      }
      audio = media;
      if (!audio) { update({ playing: false, status: state.enabled && !unlocked ? 'ready' : 'paused' }); return; }
      applySettings();
      events.forEach(([name, callback]) => audio!.addEventListener(name, callback));
      // Attaching/remounting an element never bypasses the first user gesture.
      if (unlocked && state.enabled && !hidden) void play();
    },
    restoreSettings(raw: unknown) {
      if (interacted) return;
      const settings = normalizeMusicSettings(raw);
      update({ ...settings, playing: false, status: settings.enabled ? 'ready' : 'paused', error: null });
      applySettings();
    },
    unlockMusic() {
      interacted = unlocked = true;
      if (state.enabled && state.status !== 'error') void play();
    },
    startMusic() {
      interacted = unlocked = true;
      const retry = state.status === 'error';
      update({ enabled: true }); save();
      void play(retry);
    },
    pauseMusic() {
      interacted = true;
      update({ enabled: false }); save(); stop();
    },
    toggleMusic() {
      if (state.enabled && (state.playing || state.status === 'loading')) this.pauseMusic();
      else this.startMusic();
    },
    retryMusic() {
      interacted = unlocked = true;
      update({ enabled: true }); save();
      void play(true);
    },
    setMuted(muted: boolean) {
      interacted = true;
      update({ muted: !!muted }); applySettings(); save();
    },
    setVolume(volume: number) {
      if (!Number.isFinite(volume)) return;
      interacted = true;
      update({ volume: Math.max(0, Math.min(1, volume)) }); applySettings(); save();
    },
    setVisibility(isHidden: boolean) {
      if (hidden === isHidden) return;
      hidden = isHidden;
      if (hidden) stop();
      else if (state.enabled && unlocked && state.status !== 'error') void play();
    },
  };
}
