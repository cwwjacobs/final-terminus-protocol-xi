import { ARENA_RADIUS } from './content.ts';
import type { GameState } from './types.ts';

export const LOGOS_MIN_RADIUS = 11;
export const LOGOS_RETREAT_SPEED = .65;
type ArenaState = Pick<GameState, 'encounter' | 'logos'>;

/** The saved boundary is shared by combat, rooms and presentation. Legacy saves
 * begin at the full platform and retreat gently on their next simulation tick. */
export function arenaRadius(state: ArenaState): number {
  return state.encounter === 'logos' && ['giant', 'collapse', 'escaped'].includes(state.logos.stage)
    ? state.logos.arenaRadius ?? ARENA_RADIUS : ARENA_RADIUS;
}

export function targetArenaRadius(state: Pick<GameState, 'boss'>): number {
  // The six opening statues already remove 12% of Logos's health.
  const coherence = Math.max(0, Math.min(1, state.boss.hp / (state.boss.maxHp * .88)));
  return LOGOS_MIN_RADIUS + (ARENA_RADIUS - LOGOS_MIN_RADIUS) * coherence;
}

export function confineToArena(point: { x: number; z: number }, radius: number): void {
  const length = Math.hypot(point.x, point.z);
  if (length > radius) { point.x *= radius / length; point.z *= radius / length; }
}

/** A radial escape can point into the void. Choose the nearest reachable spot
 * outside the committed circle instead of letting a trust run against the rim. */
export function circleEscapeTarget(actor: { x: number; z: number }, cast: { x: number; z: number; radius: number }, radius: number, slot: number) {
  let dx = actor.x - cast.x, dz = actor.z - cast.z;
  if (Math.hypot(dx, dz) < .1) { dx = slot % 2 ? 1 : -1; dz = .2; }
  const length = Math.hypot(dx, dz), reach = cast.radius + 1.8;
  const point = { x: cast.x + dx / length * reach, z: cast.z + dz / length * reach };
  if (Math.hypot(point.x, point.z) <= radius) return point;
  let bestDistance = Infinity;
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    const x = cast.x + Math.sin(angle) * reach, z = cast.z + Math.cos(angle) * reach;
    const distance = Math.hypot(actor.x - x, actor.z - z);
    if (Math.hypot(x, z) <= radius && distance < bestDistance) {
      bestDistance = distance; point.x = x; point.z = z;
    }
  }
  return point;
}

/** Shrink never expands after a heal and cannot outrun walking. Target positions
 * move with the rim, keeping both hands and every statue on reachable ground. */
export function stepLogosArena(state: GameState, dt: number): void {
  if (state.encounter !== 'logos' || state.logos.stage !== 'giant') return;
  const previous = arenaRadius(state);
  const radius = Math.min(previous, Math.max(targetArenaRadius(state), previous - LOGOS_RETREAT_SPEED * dt));
  state.logos.arenaRadius = radius;
  const scale = radius / previous;
  state.boss.x *= scale; state.boss.z *= scale;
  for (const enemy of state.enemies) {
    if (enemy.id === 'left-hand' || enemy.id === 'right-hand') {
      enemy.x *= scale; enemy.z *= scale;
    } else confineToArena(enemy, radius - 1);
  }
  for (const actor of state.party) {
    confineToArena(actor, radius);
    // A dash must also return to ground that still exists.
    if (actor.sequence?.kind === 'criticalDash') {
      const length = Math.hypot(actor.sequence.originX, actor.sequence.originZ);
      if (length > radius) { actor.sequence.originX *= radius / length; actor.sequence.originZ *= radius / length; }
    }
  }
}
