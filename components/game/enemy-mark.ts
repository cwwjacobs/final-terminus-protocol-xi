import { BURST_WINDOW, CHAIN_MIN_DELAY, CHAIN_WINDOW, MAGIC, WEAPONS } from '../../game/content.ts';
import type { GameState } from '../../game/types.ts';
import { activeBurst } from './combat-feedback.ts';

/** Presentation comes from live combat windows, never from event text. */
export function enemyMark(state: GameState) {
  if (state.status !== 'fighting' || state.boss.hp <= 0) return null;
  if (state.duskRemaining > 0) return {
    remaining: state.duskRemaining, kind: 'burst' as const, symbol: 'dusk' as const, color: '#e2a5ff',
    fraction: Math.max(0, Math.min(1, state.duskRemaining / 10)), ready: true,
    label: 'Dusk · all elements magic burst window',
  };
  const burst = activeBurst(state);
  if (burst) return {
    remaining: burst.remaining,
    kind: 'burst' as const, symbol: burst.element, color: MAGIC[burst.element].color,
    fraction: Math.max(0, Math.min(1, burst.remaining / BURST_WINDOW)), ready: true,
    label: `${burst.element} magic burst window`,
  };
  const chain = state.chain;
  if (!chain || chain.remaining <= 0) return null;
  const next = WEAPONS[chain.weapon].next;
  const ready = state.time - chain.openedAt + 1e-8 >= CHAIN_MIN_DELAY;
  return {
    remaining: chain.remaining,
    kind: 'chain' as const, symbol: next, color: '#e2c88b',
    fraction: Math.max(0, Math.min(1, chain.remaining / CHAIN_WINDOW)), ready,
    label: `${WEAPONS[next].name} chain ${ready ? 'opening' : 'preparing'}`,
  };
}
