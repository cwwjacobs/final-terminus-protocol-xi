'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createMusicPlayer } from './music-player.ts';
import { MUSIC_STORAGE_KEY } from './music-settings.ts';

export function useGameMusic() {
  const [player] = useState(() => createMusicPlayer(settings => {
    try { localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Playback works without local storage. */ }
  }));
  const restored = useRef(false);
  const restorePreferences = useCallback(() => {
    if (restored.current) return;
    restored.current = true;
    try { player.restoreSettings(JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY) || 'null')); }
    catch { player.restoreSettings(null); }
  }, [player]);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const audioRef = useCallback((element: HTMLAudioElement | null) => player.attachAudio(element), [player]);
  useEffect(() => {
    restorePreferences();
    const visibility = () => player.setVisibility(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [player, restorePreferences]);
  return {
    ...snapshot,
    audioRef,
    startMusic: () => { restorePreferences(); player.startMusic(); },
    pauseMusic: () => { restorePreferences(); player.pauseMusic(); },
    toggleMusic: () => { restorePreferences(); player.toggleMusic(); },
    retryMusic: () => { restorePreferences(); player.retryMusic(); },
    unlockMusic: () => { restorePreferences(); player.unlockMusic(); },
    setMuted: (muted: boolean) => { restorePreferences(); player.setMuted(muted); },
    setVolume: (volume: number) => { restorePreferences(); player.setVolume(volume); },
  };
}

export type GameMusic = ReturnType<typeof useGameMusic>;
