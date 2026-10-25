'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../game/types';
import { combatSound, createCombatAudio } from './combat-audio';
import { PresentationEvents } from './world-feedback';
const STORAGE = 'terminus-xi-effects-volume';
export function useCombatAudio(state: GameState, epoch: number, active: boolean) {
  const [volume, setVolume] = useState(.35);
  const player = useRef<ReturnType<typeof createCombatAudio> | null>(null);
  const feed = useRef<PresentationEvents | null>(null);
  useEffect(() => {
    const audio = createCombatAudio(); player.current = audio;
    try { const raw = localStorage.getItem(STORAGE); const saved = Number(raw); if (raw !== null && Number.isFinite(saved)) { const v = Math.max(0, Math.min(1, saved)); setVolume(v); audio.setVolume(v); } } catch {}
    const unlock = () => audio.unlock();
    const visibility = () => { if (document.hidden) audio.silence(); };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); document.removeEventListener('visibilitychange', visibility); audio.dispose(); player.current = null; };
  }, []);
  useEffect(() => {
    if (!feed.current) { feed.current = new PresentationEvents(state, epoch); return; }
    const incoming = feed.current.read(state, epoch);
    if (incoming.reset || !active) { player.current?.silence(); return; }
    for (const event of incoming.events) { const sound = combatSound(event); if (sound) player.current?.play(sound); }
  }, [state, epoch, active]);
  return { volume, unlock: () => player.current?.unlock(), setVolume(value: number) {
    const v = Math.max(0, Math.min(1, value)); setVolume(v); player.current?.setVolume(v);
    try { localStorage.setItem(STORAGE, String(v)); } catch {}
  } };
}
