import { createGame } from '../game/engine.ts';
import { ARENA_RADIUS, FIXED_STEP, REVELRY, ROLES } from '../game/content.ts';
import type { GameState } from '../game/types.ts';
import { migrateRevelryState } from './state-migrations.ts';

const FLOAT_TOLERANCE = 1e-9;
const MAX_RESOURCE_CAPACITY = 10_000_000;

/** Restore a detached current state, defaulting only absent legacy buff fields. */
export function restoreSave(raw: unknown): GameState | null {
  const state = migrateRevelryState(raw);
  return validSave(state) ? state : null;
}

/** Validate browser saves before restoring them into the local kernel. */
export function validSave(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') return false;
  const state = raw as GameState;
  const finiteShape = (value: unknown, template: unknown): boolean => {
    if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (typeof template === 'boolean' || typeof template === 'string') return typeof value === typeof template;
    if (template === null) return true;
    if (Array.isArray(template)) {
      return Array.isArray(value) && value.length === template.length &&
        template.every((item, index) => finiteShape(value[index], item));
    }
    if (template && typeof template === 'object') {
      return !!value && typeof value === 'object' && Object.entries(template).every(
        ([key, item]) => finiteShape((value as Record<string, unknown>)[key], item),
      );
    }
    return false;
  };

  const template = createGame(state.mode === 'god' ? 'god' : 'trial');
  const base = Object.fromEntries(Object.entries(template).filter(
    ([key]) => !['events', 'chain', 'burst', 'boss'].includes(key),
  ));
  const bossBase = Object.fromEntries(Object.entries(template.boss).filter(([key]) => key !== 'cast'));
  if (!finiteShape(state, base) || !finiteShape(state.boss, bossBase)) return false;
  if (!Number.isSafeInteger(state.tick) || state.tick < 0 ||
    !Number.isSafeInteger(state.eventSeq) || state.eventSeq < 0 ||
    state.time < 0 || state.combatTime < 0 ||
    state.remainder < -FLOAT_TOLERANCE || state.remainder >= FIXED_STEP + FLOAT_TOLERANCE) return false;
  if (state.party.some((actor) => !Object.hasOwn(ROLES, actor.role) ||
    !Number.isInteger(actor.revelryStacks) || actor.revelryStacks < 0 || actor.revelryStacks > REVELRY.maxStacks ||
    actor.maxHp <= 0 || actor.maxHp > MAX_RESOURCE_CAPACITY ||
    actor.maxMp <= 0 || actor.maxMp > MAX_RESOURCE_CAPACITY ||
    Math.hypot(actor.moveX, actor.moveZ) > 1 + FLOAT_TOLERANCE ||
    Math.hypot(actor.x, actor.z) > ARENA_RADIUS + FLOAT_TOLERANCE ||
    Array.isArray(actor.cooldowns))) return false;
  if (state.chain && (!['cleave', 'pierce', 'resonance'].includes(state.chain.weapon) ||
    ![state.chain.remaining, state.chain.openedAt, state.chain.opener].every(Number.isFinite) ||
    !Number.isInteger(state.chain.opener) || state.chain.opener < 0 || state.chain.opener >= state.party.length)) return false;
  if (state.burst && (!['fire', 'ice', 'lightning'].includes(state.burst.element) ||
    !Number.isFinite(state.burst.remaining))) return false;
  if (state.boss.cast && (!['circle', 'cone', 'raid'].includes(state.boss.cast.kind) ||
    ![state.boss.cast.remaining, state.boss.cast.total, state.boss.cast.x, state.boss.cast.z,
      state.boss.cast.radius, state.boss.cast.angle].every(Number.isFinite))) return false;
  if (state.party.some((actor) => Object.values(actor.cooldowns).some(
    (remaining) => typeof remaining !== 'number' || !Number.isFinite(remaining),
  ))) return false;

  return state.version === 1 && ['trial', 'god'].includes(state.mode) &&
    ['ready', 'fighting', 'victory', 'defeat'].includes(state.status) && Number.isFinite(state.time) &&
    Array.isArray(state.party) && state.party.length === 5 && state.party.every((actor) =>
      [actor.x, actor.z, actor.facing, actor.hp, actor.maxHp, actor.mp, actor.maxMp, actor.tp, actor.ce, actor.ve]
        .every(Number.isFinite) && actor.maxHp > 0 && actor.cooldowns && typeof actor.cooldowns === 'object',
    ) && !!state.boss && [state.boss.x, state.boss.z, state.boss.hp, state.boss.maxHp].every(Number.isFinite) &&
    Array.isArray(state.events) && state.events.length <= 100 && state.events.every((event) =>
      !!event && typeof event === 'object' && Number.isFinite(event.id) && Number.isFinite(event.time) &&
      typeof event.text === 'string' && typeof event.kind === 'string' &&
      (event.target === undefined || (Number.isInteger(event.target) && event.target >= 0 && event.target < 5)),
    );
}
