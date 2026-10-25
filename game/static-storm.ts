import type { GameState } from './types.ts';

export const STATIC_CHARGE_SECONDS = 2;
export const STATIC_REACH = 12;
export const STATIC_CHAIN_REACH = 5;
export const STATIC_MAX_TARGETS = 3;
export interface StaticStorm { rng: number; remaining: number; charge: number }

/** A saved stream separate from critical-hit RNG; intervals are combat seconds. */
export function nextStaticInterval(storm: StaticStorm): number {
  storm.rng = (Math.imul(storm.rng, 1664525) + 1013904223) >>> 0;
  return 180 + storm.rng / 4294967296 * 120;
}
export function createStaticStorm(seed: number): StaticStorm {
  const storm = { rng: (seed ^ 0x9e3779b9) >>> 0, remaining: 0, charge: 0 };
  storm.remaining = nextStaticInterval(storm);
  return storm;
}

/** Nearest live target, then nearby allies. Never visits the same actor twice. */
export function staticArcTargets(state: Pick<GameState, 'boss' | 'party'>): number[] {
  const targets: number[] = [];
  let origin = { x: state.boss.x, z: state.boss.z };
  for (let jump = 0; jump < STATIC_MAX_TARGETS; jump++) {
    const reach = jump === 0 ? STATIC_REACH : STATIC_CHAIN_REACH;
    const nearest = state.party.map((actor, slot) => ({ actor, slot, distance: Math.hypot(actor.x - origin.x, actor.z - origin.z) }))
      .filter(item => item.actor.hp > 0 && !targets.includes(item.slot) && item.distance <= reach)
      .sort((a, b) => a.distance - b.distance || a.slot - b.slot)[0];
    if (!nearest) break;
    targets.push(nearest.slot); origin = nearest.actor;
  }
  return targets;
}
