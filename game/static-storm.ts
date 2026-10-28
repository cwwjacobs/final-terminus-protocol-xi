import type { GameState } from './types.ts';

export const STATIC_CHARGE_SECONDS = 2;
export const STATIC_REACH = 12;
export const STATIC_CHAIN_REACH = 5;
export const STATIC_MAX_TARGETS = 3;
export const STATIC_SHOCK_SECONDS = 20;
export const STATIC_RETALIATION_DAMAGE = 180;
export const STATIC_REFLECT_DAMAGE = 600;
export interface StaticStorm { rng: number; remaining: number; charge: number; target: 'boss' | 'heracles' | 'arena'; x: number; z: number; enemyId: string }

function stormRandom(storm: StaticStorm): number {
  storm.rng = (Math.imul(storm.rng, 1664525) + 1013904223) >>> 0;
  return storm.rng / 4294967296;
}

/** A saved stream separate from critical-hit RNG; intervals are combat seconds. */
export function nextStaticInterval(storm: StaticStorm): number {
  return 15 + stormRandom(storm) * 10;
}
export function createStaticStorm(seed: number): StaticStorm {
  const storm: StaticStorm = { rng: (seed ^ 0x9e3779b9) >>> 0, remaining: 0, charge: 0, target: 'boss', x: 0, z: -4, enemyId: 'boss' };
  storm.remaining = nextStaticInterval(storm);
  return storm;
}

/** All three targets use the saved storm stream, independently of combat criticals. */
export function selectStaticStrike(state: Pick<GameState, 'storm' | 'party' | 'boss' | 'enemies' | 'logos'>) {
  const storm = state.storm;
  const heracles = state.party.find(actor => actor.id === 'heracles' && actor.hp > 0);
  const choices: StaticStorm['target'][] = heracles ? ['boss', 'heracles', 'arena'] : ['boss', 'arena'];
  storm.target = choices[Math.floor(stormRandom(storm) * choices.length)];
  storm.enemyId = 'boss';
  let point: { x: number; z: number } = state.boss;
  if (storm.target === 'boss' && (state.logos.stage === 'sentinels' || state.logos.stage === 'giant' && state.enemies.some(enemy => enemy.id.startsWith('sentinel-') && enemy.hp > 0))) {
    const enemies = state.enemies.filter(enemy => enemy.id.startsWith('sentinel-') && enemy.hp > 0);
    const enemy = enemies[Math.floor(stormRandom(storm) * enemies.length)];
    if (enemy) { point = enemy; storm.enemyId = enemy.id; }
  }
  if (storm.target === 'heracles' && heracles) point = heracles;
  if (storm.target === 'arena') {
    const angle = stormRandom(storm) * Math.PI * 2, radius = 5 + stormRandom(storm) * 15;
    storm.x = Math.sin(angle) * radius; storm.z = Math.cos(angle) * radius;
  } else { storm.x = point.x; storm.z = point.z; }
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
