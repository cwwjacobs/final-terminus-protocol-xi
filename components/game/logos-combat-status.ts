import type { GameState } from '../../game/types.ts';
import { GIANT_STATUE_WAVES, giantStatuesActive, statuesEntering } from '../../game/logos.ts';

/** Current encounter mechanics only; the field guide does not preview these phases. */
export function logosCombatStatus(state: GameState) {
  if (state.encounter !== 'logos' || state.status !== 'fighting' || !['sentinels', 'giant'].includes(state.logos.stage)) return null;
  const activeStatues = state.enemies.filter(enemy => enemy.id.startsWith('sentinel-') && enemy.hp > 0).length;
  const protectedByStatues = state.logos.stage === 'sentinels' || giantStatuesActive(state);
  const entering = statuesEntering(state);
  const linkedHit = state.events.findLast(event => event.source === 'statueLink' && (event.value ?? 0) > 0 && state.combatTime >= event.time && state.combatTime - event.time <= 2.5);
  return {
    protectedByStatues,
    entering,
    activeStatues,
    finalExposure: !protectedByStatues && (state.logos.statueWave ?? 0) >= GIANT_STATUE_WAVES,
    exposureRemaining: protectedByStatues ? 0 : Math.max(0, state.logos.exposureRemaining ?? 20),
    linkedDamage: linkedHit?.value ?? 0,
    linkedEventId: linkedHit?.id,
    heading: protectedByStatues ? 'Statues active · defeat them to weaken Logos' : 'Logos exposed · strike the head and hands',
  };
}
