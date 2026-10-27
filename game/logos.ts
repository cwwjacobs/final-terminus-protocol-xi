import type { Actor, GameState } from './types.ts';

export const DESCENT_SECONDS = 60;
export const COLLAPSE_SECONDS = 6;
export const SENTINEL_NAMES = ['Observation', 'Judgment', 'Memory', 'Reason', 'Order', 'Knowledge'];
export const sequenceLocked = (state: GameState) => ['descent', 'collapse', 'escaped'].includes(state.logos.stage);
/** Trusts need no vote. Zero connected humans never auto-skip the countdown. */
export function descentReadiness(state: GameState) {
  const ready = new Set(state.logos.readySlots ?? []);
  const players = state.party.flatMap((actor, slot) => actor.human ? [{ slot, name: actor.name, ready: ready.has(slot) }] : []);
  const count = players.filter(player => player.ready).length;
  return { players, count, total: players.length, allReady: players.length > 0 && count === players.length };
}
export function enemyTargets(state: GameState): { id: string; name: string; hp: number; maxHp: number; x: number; z: number }[] {
  if (state.status !== 'fighting' || sequenceLocked(state)) return [];
  const enemies = state.enemies.filter(e => e.hp > 0);
  if (state.logos.stage === 'sentinels') return enemies;
  return [...(state.boss.hp > 0 ? [{ ...state.boss, id: 'boss', name: state.logos.stage === 'giant' ? 'Logos · Head' : state.boss.name }] : []), ...enemies];
}
export function offensiveTarget(state: GameState, actor: Actor) {
  const explicit = state.enemies.find(e => e.id === actor.enemyTarget && e.hp > 0);
  if (explicit) return explicit;
  if (state.logos.stage === 'sentinels') return state.enemies.find(e => e.hp > 0) ?? state.boss;
  return state.boss;
}
