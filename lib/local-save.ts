import { createGame } from '../game/engine.ts';
import { ARENA_RADIUS, FIXED_STEP, REVELRY, ROLES } from '../game/content.ts';
import type { GameState } from '../game/types.ts';
import { migrateGameState } from './state-migrations.ts';

const FLOAT_TOLERANCE = 1e-9;
const MAX_RESOURCE_CAPACITY = 10_000_000;
const ELEMENTS = ['fire', 'ice', 'lightning'];
const BOSS_ABILITIES = ['nullBloom', 'severingArc', 'resonantPulse', 'regentsDecree', 'terminalEcho', 'collapse'];
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const slot = (value: unknown): value is number => integer(value, 0, 4);
const cooldowns = (value: unknown): boolean => record(value) && Object.values(value).every(nonnegative);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const withinArena = (x: unknown, z: unknown): boolean =>
  finite(x) && finite(z) && Math.hypot(x, z) <= ARENA_RADIUS + FLOAT_TOLERANCE;

export function restoreSave(raw: unknown): GameState | null {
  const state = migrateGameState(raw);
  return validSave(state) ? state : null;
}

/** Current snapshots are strict. Historical defaults belong only to migration. */
export function validSave(raw: unknown): raw is GameState {
  if (!record(raw) || raw.version !== 2) return false;
  const state = raw as unknown as GameState;
  const finiteShape = (value: unknown, template: unknown): boolean => {
    if (typeof template === 'number') return finite(value);
    if (typeof template === 'boolean' || typeof template === 'string') return typeof value === typeof template;
    if (!record(template) || !record(value)) return false;
    return Object.entries(template).every(([key, item]) => finiteShape(value[key], item));
  };
  const template = createGame(state.mode === 'god' ? 'god' : 'trial');
  const omit = (value: object, keys: string[]) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  if (!finiteShape(state, omit(template, ['events', 'chain', 'burst', 'boss', 'party', 'runStats'])) ||
    !finiteShape(state.boss, omit(template.boss, ['cast', 'cooldowns'])) ||
    !Array.isArray(state.party) || state.party.length !== 5 ||
    !['trial', 'god'].includes(state.mode) || !['ready', 'fighting', 'victory', 'defeat'].includes(state.status)) return false;
  if (!integer(state.tick, 0) || !integer(state.eventSeq, 0) || !integer(state.sequenceSeq, 0) ||
    !integer(state.rng, 0, 0xffffffff) || state.time < 0 || state.combatTime < 0 ||
    state.remainder < -FLOAT_TOLERANCE || state.remainder >= FIXED_STEP + FLOAT_TOLERANCE) return false;

  const storm = state.storm;
  if (!record(storm) || !exactKeys(storm, ['rng', 'remaining', 'charge']) || !integer(storm.rng, 0, 0xffffffff) || !nonnegative(storm.remaining) || storm.remaining > 300 + FLOAT_TOLERANCE || !nonnegative(storm.charge) || storm.charge > 2 + FLOAT_TOLERANCE) return false;
  const stats = state.runStats;
  if (!record(stats) || !exactKeys(stats, ['startedAt', 'partial', 'party']) ||
    !nonnegative(stats.startedAt) || stats.startedAt > state.combatTime + FLOAT_TOLERANCE ||
    typeof stats.partial !== 'boolean' || (!stats.partial && stats.startedAt !== 0) ||
    !Array.isArray(stats.party) || stats.party.length !== state.party.length ||
    stats.party.some(entry => !record(entry) || !exactKeys(entry, ['damage', 'healing', 'taken', 'deaths']) ||
      ![entry.damage, entry.healing, entry.taken].every(value => nonnegative(value) && value <= 1e12) ||
      !integer(entry.deaths, 0, 1e9))) return false;

  const sequenceIds = new Set<number>();
  for (const actor of state.party) {
    if (!finiteShape(actor, omit(template.party[0], ['cooldowns', 'rapidWeave', 'elementalCycle', 'sequence', 'mendingThread'])) ||
      !Object.hasOwn(ROLES, actor.role) || !ELEMENTS.includes(actor.shotElement) ||
      !integer(actor.revelryStacks, 0, REVELRY.maxStacks) || !integer(actor.shieldCharges, 0, 1) ||
      actor.maxHp <= 0 || actor.maxHp > MAX_RESOURCE_CAPACITY || actor.maxMp <= 0 || actor.maxMp > MAX_RESOURCE_CAPACITY ||
      actor.hp < 0 || actor.hp > actor.maxHp || actor.mp < 0 || actor.mp > actor.maxMp || actor.tp < 0 || actor.tp > 3000 ||
      Math.hypot(actor.moveX, actor.moveZ) > 1 + FLOAT_TOLERANCE || !withinArena(actor.x, actor.z) ||
      !cooldowns(actor.cooldowns) || !nonnegative(actor.recovery) || !nonnegative(actor.spellRecovery) ||
      !nonnegative(actor.selfChainUntil)) return false;
    const thread = actor.mendingThread;
    if (thread !== null && (!record(thread) || !exactKeys(thread, ['remaining', 'tickIn', 'source']) || !finite(thread.remaining) || thread.remaining <= 0 || thread.remaining > 12 || !finite(thread.tickIn) || thread.tickIn <= 0 || thread.tickIn > 2 + FLOAT_TOLERANCE || !slot(thread.source) || state.party[thread.source].role !== 'luminary')) return false;
    const weave = actor.rapidWeave;
    if (weave !== null) {
      if (!record(weave) || !exactKeys(weave, ['remaining', 'charges', 'refresh']) ||
        !finite(weave.remaining) || weave.remaining <= 0 || weave.remaining > 12 + FLOAT_TOLERANCE ||
        !record(weave.charges) || !exactKeys(weave.charges, ELEMENTS) ||
        !Object.values(weave.charges).every(value => integer(value, 0, 2)) ||
        !record(weave.refresh) || !exactKeys(weave.refresh, ELEMENTS) ||
        !Object.values(weave.refresh).every(value => nonnegative(value) && value <= 0.5 + FLOAT_TOLERANCE)) return false;
    }
    const cycle = actor.elementalCycle;
    if (!record(cycle) || !exactKeys(cycle, ['elements', 'remaining']) ||
      !Array.isArray(cycle.elements) || cycle.elements.length > 2 ||
      cycle.elements.some(element => !ELEMENTS.includes(element)) || new Set(cycle.elements).size !== cycle.elements.length ||
      !nonnegative(cycle.remaining) || cycle.remaining > 12 + FLOAT_TOLERANCE) return false;
    const sequence = actor.sequence;
    if (sequence !== null) {
      if (!record(sequence) || !exactKeys(sequence, ['id', 'kind', 'elapsed', 'nextHit', 'landedHits', 'originX', 'originZ']) ||
        !integer(sequence.id, 1, state.sequenceSeq) || sequenceIds.has(sequence.id) ||
        !['criticalDash', 'splitVolley'].includes(sequence.kind) ||
        !nonnegative(sequence.elapsed) || sequence.elapsed > 1.25 + FLOAT_TOLERANCE ||
        !integer(sequence.nextHit, 0, sequence.kind === 'criticalDash' ? 3 : 5) ||
        !integer(sequence.landedHits, 0, sequence.nextHit) ||
        !withinArena(sequence.originX, sequence.originZ)) return false;
      const hitTimes = sequence.kind === 'criticalDash' ? [.2, .6, 1] : [0, .25, .5, .75, 1];
      const resolved = sequence.elapsed === 0 ? 0 : hitTimes.filter(time => time <= sequence.elapsed + 1e-8).length;
      if (sequence.nextHit !== resolved) return false;
      sequenceIds.add(sequence.id);
    }
  }
  if (!cooldowns(state.boss.cooldowns) || state.boss.maxHp <= 0 || state.boss.maxHp > MAX_RESOURCE_CAPACITY ||
    state.boss.hp < 0 || state.boss.hp > state.boss.maxHp || !integer(state.boss.target, -1, 4) ||
    !integer(state.boss.phase, 1, 3) || !integer(state.boss.castCount, 0)) return false;
  if (state.chain !== null && (!record(state.chain) || typeof state.chain.property !== 'string' ||
    !['cleave', 'pierce', 'resonance'].includes(state.chain.weapon) || !nonnegative(state.chain.remaining) ||
    !nonnegative(state.chain.openedAt) || !slot(state.chain.opener))) return false;
  if (state.burst !== null && (!record(state.burst) || !ELEMENTS.includes(state.burst.element) || !nonnegative(state.burst.remaining))) return false;
  const cast = state.boss.cast;
  if (cast !== null && (!record(cast) || typeof cast.name !== 'string' ||
    !['circle', 'cone', 'raid'].includes(cast.kind) ||
    ![cast.remaining, cast.total, cast.radius].every(nonnegative) ||
    ![cast.x, cast.z, cast.angle].every(finite) || cast.remaining > cast.total + FLOAT_TOLERANCE ||
    (Object.hasOwn(cast, 'abilityId') && !BOSS_ABILITIES.includes(cast.abilityId as string)) ||
    (Object.hasOwn(cast, 'target') && !slot(cast.target)) ||
    (Object.hasOwn(cast, 'pulses') && !integer(cast.pulses, 1, 2)))) return false;
  const hitIds = new Set<string>();
  return Array.isArray(state.events) && state.events.length <= 100 && state.events.every(event => {
    if (!(record(event) && integer(event.id, 0) && nonnegative(event.time) &&
    typeof event.text === 'string' && typeof event.kind === 'string' &&
    (event.actor === undefined || slot(event.actor)) && (event.value === undefined || finite(event.value)) &&
    (event.target === undefined || slot(event.target)) &&
    (event.source === undefined || typeof event.source === 'string') &&
    (event.critical === undefined || typeof event.critical === 'boolean'))) return false;
    if (Object.hasOwn(event, 'sequenceId') || Object.hasOwn(event, 'hitIndex')) {
      if (!integer(event.sequenceId, 1, state.sequenceSeq) ||
        !['criticalDash', 'splitVolley'].includes(event.source ?? '') || event.kind !== 'weapon' || !slot(event.actor) ||
        !integer(event.hitIndex, 0, event.source === 'criticalDash' ? 2 : 4)) return false;
      const identity = `${event.sequenceId}:${event.hitIndex}`;
      if (hitIds.has(identity)) return false;
      hitIds.add(identity);
    }
    return true;
  });
}
