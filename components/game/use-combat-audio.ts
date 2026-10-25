'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameState } from '../../game/types';
import { CombatAudioQueue, createCombatAudio } from './combat-audio';
import { PresentationEvents } from './world-feedback';
const STORAGE = 'terminus-xi-effects-volume';
const VOLUME_EVENT = 'terminus-xi-effects-volume-change';
let sessionVolume: number | undefined;
function volumeSnapshot() {
  if (sessionVolume !== undefined) return sessionVolume;
  try {
    const raw = localStorage.getItem(STORAGE), saved = Number(raw);
    if (raw !== null && Number.isFinite(saved)) return Math.max(0, Math.min(1, saved));
  } catch {}
  return .35;
}
function subscribeVolume(notify: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === STORAGE || event.key === null) { sessionVolume = undefined; notify(); } };
  window.addEventListener(VOLUME_EVENT, notify); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(VOLUME_EVENT, notify); window.removeEventListener('storage', storage); };
}
const serverVolume = () => .35;
export function useCombatAudio(state: GameState, epoch: number, active: boolean) {
  const volume = useSyncExternalStore(subscribeVolume, volumeSnapshot, serverVolume);
  const player = useRef<ReturnType<typeof createCombatAudio> | null>(null);
  const feed = useRef<PresentationEvents | null>(null);
  const queue = useRef<CombatAudioQueue | null>(null);
  const latest = useRef({ state, epoch, active });
  useEffect(() => { latest.current = { state, epoch, active }; }, [state, epoch, active]);
  useEffect(() => {
    const audio = createCombatAudio(); player.current = audio;
    const pending = new CombatAudioQueue(); queue.current = pending;
    feed.current = new PresentationEvents(latest.current.state, latest.current.epoch);
    audio.setVolume(volumeSnapshot());
    const unlock = () => audio.unlock();
    const visibility = () => {
      pending.reset(); audio.silence();
      feed.current = new PresentationEvents(latest.current.state, latest.current.epoch);
    };
    // Presentation time keeps a final blow's contact audible after the combat
    // clock stops at victory. The frame loop is cancelled on unmount, and all
    // pending work is discarded on visibility/pause/reset transitions.
    let frame = 0;
    const tick = (now: number) => {
      const current = latest.current;
      if (current.active && !document.hidden && pending.size > 0) {
        for (const cue of pending.drain(now / 1000, current.state.party.map(actor => actor.hp > 0))) {
          if (cue.sound === 'bossCharge') audio.beginBossCharge(current.state.boss.cast);
          else audio.play(cue.sound, cue.gain, cue.priority);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); document.removeEventListener('visibilitychange', visibility); pending.reset(); audio.dispose(); player.current = null; queue.current = null; feed.current = null; };
  }, []);
  useEffect(() => { player.current?.setVolume(volume); if (volume === 0) queue.current?.reset(); }, [volume]);
  useEffect(() => {
    if (!feed.current) { feed.current = new PresentationEvents(state, epoch); return; }
    const incoming = feed.current.read(state, epoch), audio = player.current, pending = queue.current!;
    if (incoming.reset || !active || document.hidden) { pending.reset(); audio?.silence(); return; }
    const now = performance.now() / 1000;
    for (const event of incoming.events) pending.enqueue(event, now, typeof event.actor === 'number' ? state.party[event.actor]?.id : undefined);
    audio?.syncBossCharge(state.status === 'fighting' ? state.boss.cast : null);
  }, [state, epoch, active]);
  return { volume, unlock: () => player.current?.unlock(), setVolume(value: number) {
    const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    sessionVolume = v; player.current?.setVolume(v);
    if (v === 0) queue.current?.reset();
    try { localStorage.setItem(STORAGE, String(v)); } catch {}
    window.dispatchEvent(new Event(VOLUME_EVENT));
  } };
}
