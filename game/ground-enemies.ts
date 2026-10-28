import type { Enemy, GameState } from './types.ts';

export const GROUND_EMERGE_SECONDS = 3;
export const GROUND_MAX_ALIVE = 3;
export const GROUND_GOD_WAVE_TIMES = [24, 110, 200] as const;
export const GROUND_WAVES = [
  { at: 16, kinds: ['ground-shard', 'storm-shard'] },
  { at: 48, kinds: ['ground-shard', 'ground-shard', 'storm-shard'] },
  { at: 80, kinds: ['ground-shard', 'storm-shard', 'storm-shard'] },
] as const;

export const GROUND_BALANCE = {
  'ground-shard': { hp: 1200, godHp: 1800, damage: 62, interval: 4.2, reach: 3, speed: 3 },
  'storm-shard': { hp: 900, godHp: 1400, damage: 48, interval: 5.2, reach: 11, speed: 2.4 },
} as const;

export const isGroundEnemy = (enemy: Enemy) => enemy.kind === 'ground-shard' || enemy.kind === 'storm-shard';

/** Bounded schedule reconstructed from retained enemy IDs, including defeated ones.
 * No independent RNG or wall-clock state: room and local catch-up stay identical.
 * A wave waits until the preceding group is cleared, preventing an add pile-up. */
export function nextGroundWave(state: GameState): Enemy[] {
  if (state.encounter !== 'crown' || state.status !== 'fighting' || state.boss.hp <= 0 || state.enemies.some(enemy => enemy.hp > 0)) return [];
  const waveIndex = GROUND_WAVES.findIndex((_, index) => !state.enemies.some(enemy => enemy.id.startsWith(`ground-${index + 1}-`)));
  if (waveIndex < 0 || state.combatTime + 1e-8 < (state.mode === 'god' ? GROUND_GOD_WAVE_TIMES[waveIndex] : GROUND_WAVES[waveIndex].at)) return [];
  return GROUND_WAVES[waveIndex].kinds.map((kind, index) => {
    const angle = .8 + waveIndex * .85 + index * Math.PI * 2 / GROUND_WAVES[waveIndex].kinds.length;
    const x = Math.sin(angle) * (11 + waveIndex), z = Math.cos(angle) * (11 + waveIndex);
    const balance = GROUND_BALANCE[kind], hp = state.mode === 'god' ? balance.godHp : balance.hp;
    return {
      id: `ground-${waveIndex + 1}-${index}`, name: kind === 'ground-shard' ? 'Ground shard' : 'Storm shard',
      kind, x, z, spawnX: x, spawnZ: z, hp, maxHp: hp, target: -1,
      emergeRemaining: GROUND_EMERGE_SECONDS, attackTimer: 1.8 + index * .6, stunRemaining: 0, burn: null,
    };
  });
}
