import type { Actor, GameState } from './types.ts';

export const DESCENT_SECONDS = 60;
export const COLLAPSE_SECONDS = 6;
export const SENTINEL_NAMES = ['Observation', 'Judgment', 'Memory', 'Reason', 'Order', 'Knowledge'];
export const sequenceLocked = (state: GameState) => ['descent', 'collapse', 'escaped'].includes(state.logos.stage);
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
