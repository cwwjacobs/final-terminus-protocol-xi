import { ABILITY_DEFINITIONS, actionUnavailable, ARENA_RADIUS, ATTACK_BASELINE, BURST_WINDOW, canUseActionRole, CHAIN_MIN_DELAY, CHAIN_WINDOW, CONE_HALF_ANGLE, cooldownKey, DEFAULT_SEED, ELEMENTS, FIXED_STEP, getAttackStats, GOD_ENRAGE_CAST, GOD_ENRAGE_TIME, GOD_ENRAGE_WARNING, MAGIC, MAGIC_RANGE, MOVE_SPEED, PARTY, REVELRY, ROLES, SKILLCHAINS, TP_COST, TP_MAX, TRAITS, WEAPONS } from './content.ts';
import { LORE } from './lore.ts';
import { createRunStats } from './run-stats.ts';
import { createStaticStorm, nextStaticInterval, STATIC_CHARGE_SECONDS, staticArcTargets } from './static-storm.ts';
import type { Action, ActionResult, Actor, BossCast, CombatPresentationMetadata, GameState, Mode, WeaponId } from './types.ts';

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const fail = (error: string): ActionResult => ({ ok: false, error });

function event(state: GameState, kind: string, text: string, actor?: number, value?: number, target?: number, source?: string, critical?: boolean, sequenceId?: number, hitIndex?: number, metadata: CombatPresentationMetadata = {}) {
  const abilityId = metadata.abilityId ?? (kind === 'auto' ? 'auto' : source ?? (['revelry', 'provoke', 'heal', 'guard', 'dodge'].includes(kind) ? kind : undefined));
  state.events.push({ id: ++state.eventSeq, time: state.combatTime, kind, text, ...(actor === undefined ? {} : { actor }), ...(value === undefined ? {} : { value }), ...(target === undefined ? {} : { target }), ...(source === undefined ? {} : { source }), ...(critical === undefined ? {} : { critical }), ...(sequenceId === undefined ? {} : { sequenceId }), ...(hitIndex === undefined ? {} : { hitIndex }), ...(abilityId === undefined ? {} : { abilityId }), ...metadata });
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
}

function castArea(cast: BossCast): NonNullable<CombatPresentationMetadata['area']> {
  const { kind, x, z, radius, angle, total, target, pulses, abilityId } = cast;
  return { kind, x, z, radius, angle, total, ...(target === undefined ? {} : { target }), ...(pulses === undefined ? {} : { pulses }), ...(abilityId === undefined ? {} : { abilityId }) };
}

export function createGame(mode: Mode = 'trial', seed = DEFAULT_SEED): GameState {
  const safeMode = mode === 'god' ? 'god' : 'trial';
  // New rotations retain the 100–180s Trial / 300–450s God active-play targets.
  const maxHp = safeMode === 'god' ? 310000 : 105000;
  return {
    version: 2, rng: seed >>> 0, sequenceSeq: 0, time: 0, combatTime: 0, tick: 0, remainder: 0, eventSeq: 0, mode: safeMode, status: 'ready', runStats: createRunStats(PARTY.length),
    storm: createStaticStorm(seed),
    party: PARTY.map((p, i) => ({
      id: p.id, name: p.name, role: p.role, color: p.color,
      x: (i - 2) * 2, z: 9 + Math.abs(i - 2), facing: Math.PI,
      hp: p.hp, maxHp: p.hp, mp: p.mp, maxMp: p.mp, tp: 0, revelryStacks: 0,
      human: i === 0, engaged: false, moveX: 0, moveZ: 0, ce: 0, ve: 0,
      cooldowns: {}, attackTimer: 0, guardUntil: 0, dodgeUntil: 0, aiTimer: 0,
      shieldCharges: 0, mendingThread: null, recovery: 0, spellRecovery: 0, shotElement: 'fire', selfChainUntil: 0,
      rapidWeave: null, elementalCycle: { elements: [], remaining: 0 }, sequence: null,
    })),
    boss: { name: LORE.boss, x: 0, z: -4, hp: maxHp, maxHp, target: -1, phase: 1, facing: 0, attackTimer: 2.5, specialTimer: 9, castCount: 0, cooldowns: {}, cast: null },
    chain: null, burst: null, events: [],
  };
}

export function setHuman(state: GameState, slot: number, human: boolean): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.party.length || typeof human !== 'boolean') return;
  const actor = state.party[slot];
  if (actor.human === human) return;
  actor.human = human;
  actor.moveX = 0;
  actor.moveZ = 0;
  actor.aiTimer = 0;
}

function bounds(actor: Actor) {
  const length = Math.hypot(actor.x, actor.z);
  if (length > ARENA_RADIUS) {
    actor.x *= ARENA_RADIUS / length;
    actor.z *= ARENA_RADIUS / length;
  }
}

function threat(actor: Actor, cumulative: number, volatile: number) {
  actor.ce = clamp(actor.ce + cumulative * TRAITS[actor.role].enmity, 0, 10000);
  actor.ve = clamp(actor.ve + volatile * TRAITS[actor.role].enmity, 0, 10000);
}

function random(state: GameState): number {
  // Saved 32-bit LCG: one authoritative stream, never wall-clock randomness.
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function grantTp(actor: Actor, amount: number) {
  actor.tp = Math.min(TP_MAX, actor.tp + amount * TRAITS[actor.role].storeTp);
}

function cancelSequence(actor: Actor, returnHome = true) {
  if (actor.sequence?.kind === 'criticalDash' && actor.hp > 0 && returnHome) {
    actor.x = actor.sequence.originX;
    actor.z = actor.sequence.originZ;
  }
  actor.sequence = null;
}

function clearTransient(actor: Actor) {
  cancelSequence(actor);
  actor.shieldCharges = 0;
  actor.mendingThread = null;
  actor.selfChainUntil = 0;
  actor.rapidWeave = null;
  actor.elementalCycle = { elements: [], remaining: 0 };
}

function finishIfNeeded(state: GameState) {
  if (state.status !== 'fighting') return;
  if (state.boss.hp <= 0) {
    state.status = 'victory';
    state.boss.hp = 0;
    state.boss.cast = null;
    state.chain = null;
    state.burst = null;
    event(state, 'victory', 'Crown Resonance dispersed. Local encounter ended; the wider fate remains unresolved.');
  } else if (state.party.every(a => a.hp <= 0)) {
    state.status = 'defeat';
    state.boss.cast = null;
    state.chain = null;
    state.burst = null;
    event(state, 'defeat', 'The party has fallen. Reassemble the protocol.');
  }
  if (state.status !== 'fighting') for (const actor of state.party) {
    clearTransient(actor);
    actor.engaged = false;
    actor.moveX = 0;
    actor.moveZ = 0;
  }
}

function damageBoss(state: GameState, slot: number, amount: number, kind: 'auto' | 'weapon' | 'chain' | 'magic' | 'burst', label: string, source?: string, guaranteedCritical = false, sequenceId?: number, hitIndex?: number, metadata: CombatPresentationMetadata = {}): number {
  if (state.status !== 'fighting' || state.boss.hp <= 0 || state.party[slot].hp <= 0) return 0;
  const stats = getAttackStats(state.party[slot]);
  const attack = kind === 'chain' || kind === 'magic' || kind === 'burst' ? stats.matk : stats.patk;
  const physical = kind === 'auto' || kind === 'weapon';
  const critical = physical && (guaranteedCritical || (TRAITS[state.party[slot].role].critChance > 0 && random(state) < TRAITS[state.party[slot].role].critChance));
  const multiplier = guaranteedCritical ? 2 : critical ? 1.5 : 1;
  const damage = Math.min(state.boss.hp, Math.round(amount * attack / ATTACK_BASELINE * multiplier * (kind === 'burst' && state.party[slot].role === 'arcanist' ? 1.1 : 1)));
  state.boss.hp -= damage;
  state.runStats.party[slot].damage += damage;
  threat(state.party[slot], damage * 0.65, damage * 0.8);
  event(state, kind, `${state.party[slot].name}: ${label} · ${damage}`, slot, damage, undefined, source, physical ? critical : undefined, sequenceId, hitIndex, metadata);
  finishIfNeeded(state);
  return damage;
}

function damageActor(state: GameState, slot: number, amount: number, label: string, physical = false) {
  const actor = state.party[slot];
  if (actor.hp <= 0) return;
  if (actor.dodgeUntil > state.time) {
    event(state, 'evade', `${actor.name} evades ${label}.`, slot);
    return;
  }
  if (actor.shieldCharges > 0) {
    actor.shieldCharges = 0;
    event(state, 'shield', `${actor.name}'s Aegis blocks ${label}.`, slot, 0, slot, 'aegis');
    return;
  }
  const damage = Math.min(actor.hp, Math.round(amount * (actor.guardUntil > state.time ? 0.35 : 1) * (physical ? 1 - TRAITS[actor.role].physicalReduction : 1)));
  if (damage > 0 && actor.revelryStacks > 0) {
    event(state, 'revelry_lost', `${actor.name} loses Revelry after taking damage.`, slot, actor.revelryStacks);
    actor.revelryStacks = 0;
  }
  actor.hp -= damage;
  state.runStats.party[slot].taken += damage;
  actor.ce = Math.max(0, actor.ce - damage * 0.7);
  if (damage > 0) actor.tp = Math.min(TP_MAX, actor.tp + 45);
  event(state, 'hit', `${actor.name}: ${label} · −${damage}`, slot, damage);
  if (actor.hp <= 0) {
    state.runStats.party[slot].deaths++;
    clearTransient(actor);
    actor.engaged = false;
    actor.ce = actor.ve = actor.moveX = actor.moveZ = 0;
    event(state, 'down', `${actor.name} falls.`, slot);
  }
}

function begin(state: GameState, slot: number) {
  state.status = 'fighting';
  state.combatTime = 0;
  state.runStats = createRunStats(state.party.length);
  state.party[slot].engaged = true;
  threat(state.party[slot], 1, 1);
  event(state, 'start', `${state.party[slot].name} engages the Crown Resonance.`, slot);
  if (state.mode === 'god') event(state, 'warning', 'Coherence Collapse in 7:30. Defeat Crown Resonance before the local arena collapses.');
}

/** Untrusted runtime inputs are validated before any state mutation. */
export function applyAction(state: GameState, slot: number, action: Action): ActionResult {
  const unavailable = actionUnavailable(state, slot, action);
  if (unavailable) return fail(unavailable);
  const actor = state.party[slot];
  const type = action.type;

  if (action.type === 'move') {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.z) || Math.abs(action.x) > 100 || Math.abs(action.z) > 100 || (action.facing !== undefined && !Number.isFinite(action.facing))) return fail('Movement must contain finite, bounded numbers.');
    const length = Math.max(1, Math.hypot(action.x, action.z));
    actor.moveX = action.x / length;
    actor.moveZ = action.z / length;
    if (action.facing !== undefined) actor.facing = angleDifference(action.facing, 0);
    else if (length > 1 || Math.abs(action.x) + Math.abs(action.z) > 0.001) actor.facing = Math.atan2(action.x, action.z);
    return { ok: true };
  }
  if (action.type === 'selectShot') {
    actor.shotElement = action.element ?? ELEMENTS[(ELEMENTS.indexOf(actor.shotElement) + 1) % ELEMENTS.length];
    return { ok: true };
  }
  if (action.type === 'start') {
    if (state.status !== 'ready') return fail('The encounter has already started.');
    begin(state, slot);
    return { ok: true };
  }
  if (action.type === 'engage') {
    if (state.status === 'ready') begin(state, slot);
    else {
      actor.engaged = !actor.engaged;
      event(state, 'engage', `${actor.name} ${actor.engaged ? 'engages' : 'disengages'}.`, slot);
    }
    return { ok: true };
  }
  if (state.status !== 'fighting') return fail('Engage Crown Resonance first.');
  const key = cooldownKey(action);
  const definition = ABILITY_DEFINITIONS[key];


  if (action.type === 'revelry') {
    if (actor.id !== 'bacchus') return fail('Only Bacchus can grant Revelry.');
    actor.cooldowns.revelry = REVELRY.cooldown;
    for (const recipient of state.party) {
      if (recipient.hp > 0) recipient.revelryStacks = Math.min(REVELRY.maxStacks, recipient.revelryStacks + 1);
    }
    event(state, 'revelry', `${actor.name} grants one Revelry stack to every living party member.`, slot);
    return { ok: true };
  }

  if (action.type === 'weapon') {
    if (typeof action.id !== 'string' || !Object.hasOwn(WEAPONS, action.id)) return fail('Unknown weaponskill.');
    if (!actor.engaged) return fail('Engage before using a weaponskill.');
    if (distance(actor, state.boss) > ROLES[actor.role].range) return fail('Move into weaponskill range.');
    if (actor.tp < TP_COST) return fail('A weaponskill requires 1,000 TP.');
    const spent = actor.tp;
    actor.tp = 0;
    actor.cooldowns[key] = 2;
    actor.recovery = .5;
    const def = WEAPONS[action.id];
    const damage = def.damage * (1 + (spent - TP_COST) / 4000);
    const previous = state.chain;
    const combination = previous && (previous.opener !== slot || (actor.role === 'hunter' && actor.selfChainUntil > state.time)) && state.time - previous.openedAt + 1e-8 >= CHAIN_MIN_DELAY && previous.remaining > 0 ? SKILLCHAINS[`${previous.weapon}:${action.id}`] : undefined;
    damageBoss(state, slot, damage, 'weapon', def.name, undefined, false, undefined, undefined, { abilityId: key, weaponId: action.id });
    if (state.status !== 'fighting') return { ok: true };
    if (combination) {
      if (previous?.opener === slot) actor.selfChainUntil = 0;
      damageBoss(state, slot, damage * 0.9, 'chain', `${combination.property} skillchain`, undefined, false, undefined, undefined, { abilityId: 'chain', weaponId: action.id, element: combination.element });
      if (state.status === 'fighting') state.burst = { element: combination.element, remaining: BURST_WINDOW };
    }
    if (state.status === 'fighting') state.chain = { property: combination?.property ?? def.property, opener: slot, weapon: action.id, remaining: CHAIN_WINDOW, openedAt: state.time };
    return { ok: true };
  }
  if (action.type === 'elementalShot') {
    actor.mp -= definition.mp;
    actor.cooldowns[key] = definition.cooldown;
    actor.spellRecovery = 1;
    const element = actor.shotElement;
    const burst = state.burst?.element === element && state.burst.remaining > 0;
    const name = element === 'fire' ? 'Fire Shot' : element === 'ice' ? 'Ice Shot' : 'Lightning Shot';
    damageBoss(state, slot, burst ? 780 : 230, burst ? 'burst' : 'magic', `${name}${burst ? ' · MAGIC BURST' : ''}`, 'elementalShot', false, undefined, undefined, { abilityId: 'elementalShot', element });
    return { ok: true };
  }
  if (action.type === 'magic') {
    if (typeof action.element !== 'string' || !Object.hasOwn(MAGIC, action.element)) return fail('Unknown magic element.');
    if (distance(actor, state.boss) > MAGIC_RANGE) return fail('Move into magic range.');
    if (actor.mp < 70) return fail('Magic requires 70 MP.');
    actor.mp -= 70;
    actor.cooldowns[key] = 6;
    const rapid = actor.rapidWeave && actor.rapidWeave.charges[action.element] > 0;
    actor.spellRecovery = rapid ? .5 : 2;
    if (rapid && actor.rapidWeave) {
      actor.rapidWeave.charges[action.element]--;
      actor.rapidWeave.refresh[action.element] = .5;
    }
    const cycle = actor.elementalCycle;
    if (cycle.remaining <= 0 || cycle.elements.includes(action.element)) cycle.elements = [];
    if (cycle.elements.length === 0) cycle.remaining = 12;
    cycle.elements.push(action.element);
    if (cycle.elements.length === 3) {
      actor.mp = Math.min(actor.maxMp, actor.mp + 140);
      actor.elementalCycle = { elements: [], remaining: 0 };
      event(state, 'ability', `${actor.name} completes an Elemental Cycle.`, slot, 140, undefined, 'elementalCycle');
    }
    const burst = state.burst?.element === action.element && state.burst.remaining > 0;
    damageBoss(state, slot, burst ? 1020 : 250, burst ? 'burst' : 'magic', `${MAGIC[action.element].name}${burst ? ' · MAGIC BURST' : ''}`, undefined, false, undefined, undefined, { abilityId: key, element: action.element });
    return { ok: true };
  }
  if (action.type === 'criticalDash' || action.type === 'splitVolley') {
    actor.cooldowns[key] = definition.cooldown;
    actor.recovery = .5;
    actor.sequence = { id: ++state.sequenceSeq, kind: action.type, elapsed: 0, nextHit: 0, landedHits: 0, originX: actor.x, originZ: actor.z };
    event(state, 'ability', `${actor.name}: ${definition.name}.`, slot, undefined, undefined, action.type);
    return { ok: true };
  }
  if (action.type === 'rapidWeave') {
    actor.cooldowns[key] = definition.cooldown;
    actor.spellRecovery = 0;
    actor.rapidWeave = { remaining: 12, charges: { fire: 2, ice: 2, lightning: 2 }, refresh: { fire: 0, ice: 0, lightning: 0 } };
    event(state, 'ability', `${actor.name} enters Rapid Weave.`, slot, undefined, undefined, action.type);
    return { ok: true };
  }
  if (action.type === 'aegis') {
    actor.cooldowns[key] = definition.cooldown;
    actor.mp -= definition.mp;
    for (let i = 0; i < state.party.length; i++) {
      const recipient = state.party[i];
      if (recipient.hp <= 0 || distance(actor, recipient) > MAGIC_RANGE) continue;
      recipient.shieldCharges = 1;
      event(state, 'ability', `${recipient.name} receives Aegis.`, slot, 1, i, action.type);
    }
    return { ok: true };
  }
  if (action.type === 'provoke') {
    if (distance(actor, state.boss) > MAGIC_RANGE) return fail('Move into provoke range.');
    actor.cooldowns.provoke = 18;
    threat(actor, 300, 2800);
    event(state, 'provoke', `${actor.name} provokes Crown Resonance.`, slot);
    return { ok: true };
  }
  if (action.type === 'heal') {
    if (actor.mp < 70) return fail('Restore requires 70 MP.');
    const targets = state.party.map((p, i) => ({ p, i })).filter(({ p }) => p.hp > 0 && p.hp < p.maxHp && distance(actor, p) <= MAGIC_RANGE);
    targets.sort((a, b) => a.p.hp / a.p.maxHp - b.p.hp / b.p.maxHp || a.i - b.i);
    const target = action.target === undefined ? targets[0] : targets.find(t => t.i === action.target);
    if (!target) return fail('No wounded ally in range.');
    const restored = Math.min(target.p.maxHp - target.p.hp, Math.round(690 * TRAITS[actor.role].healingPower / 100 * (target.p.hp / target.p.maxHp < .35 ? 1.2 : 1)));
    target.p.hp += restored;
    state.runStats.party[slot].healing += restored;
    actor.mp -= 70;
    actor.cooldowns.heal = 5;
    threat(actor, restored * 0.16 * .75, restored * 0.4 * .75);
    event(state, 'heal', `${actor.name} restores ${target.p.name} · +${Math.round(restored)}`, slot, restored, target.i);
    return { ok: true };
  }
  if (action.type === 'shimmerWave') {
    actor.mp -= definition.mp;
    actor.cooldowns[key] = definition.cooldown;
    event(state, 'shimmer_wave', `${actor.name} releases Shimmer Wave.`, slot, undefined, undefined, 'shimmerWave');
    state.party.forEach((recipient, target) => {
      if (recipient.hp > 0 && distance(actor, recipient) <= MAGIC_RANGE) restoreHealth(state, slot, target, 350, 'shimmerWave');
    });
    return { ok: true };
  }
  if (action.type === 'mendingThread') {
    const targets = state.party.map((p, i) => ({ p, i })).filter(({ p }) => p.hp > 0 && p.hp < p.maxHp && distance(actor, p) <= MAGIC_RANGE);
    targets.sort((a, b) => a.p.hp / a.p.maxHp - b.p.hp / b.p.maxHp || a.i - b.i);
    const target = action.target === undefined ? targets[0] : targets.find(t => t.i === action.target);
    if (!target) return fail('No wounded ally in range.');
    actor.mp -= definition.mp;
    actor.cooldowns[key] = definition.cooldown;
    target.p.mendingThread = { remaining: 12, tickIn: 2, source: slot };
    event(state, 'ability', `${actor.name} weaves Mending Thread around ${target.p.name}.`, slot, undefined, target.i, 'mendingThread');
    return { ok: true };
  }
  if (action.type === 'guard') {
    actor.cooldowns.guard = 14;
    actor.guardUntil = state.time + 5;
    event(state, 'guard', `${actor.name} anchors a ward.`, slot);
    return { ok: true };
  }
  if (action.type === 'dodge') {
    cancelSequence(actor);
    actor.cooldowns.dodge = 4;
    actor.dodgeUntil = state.time + 0.65;
    let dx = actor.moveX, dz = actor.moveZ;
    if (Math.hypot(dx, dz) < 0.1) { dx = actor.x - state.boss.x; dz = actor.z - state.boss.z; }
    const length = Math.hypot(dx, dz) || 1;
    actor.x += dx / length * 3.8;
    actor.z += dz / length * 3.8;
    bounds(actor);
    event(state, 'dodge', `${actor.name} evades.`, slot);
    return { ok: true };
  }
  return fail(`Unsupported action: ${String(type)}.`);
}

export function isInTelegraph(actor: { x: number; z: number }, cast: BossCast): boolean {
  if (cast.kind === 'raid') return true;
  if (distance(actor, cast) > cast.radius) return false;
  return cast.kind !== 'cone' || Math.abs(angleDifference(Math.atan2(actor.x - cast.x, actor.z - cast.z), cast.angle)) <= CONE_HALF_ANGLE;
}

function moveToward(actor: Actor, x: number, z: number, stop = 0.3) {
  const dx = x - actor.x, dz = z - actor.z;
  const length = Math.hypot(dx, dz);
  actor.moveX = length > stop ? dx / length : 0;
  actor.moveZ = length > stop ? dz / length : 0;
  if (length > stop) actor.facing = Math.atan2(dx, dz);
}

function sequenceStep(state: GameState, slot: number, dt: number) {
  const actor = state.party[slot];
  const sequence = actor.sequence;
  if (!sequence) return;
  if (actor.hp <= 0 || state.status !== 'fighting' || state.boss.hp <= 0) { cancelSequence(actor); return; }
  sequence.elapsed += dt;
  const dash = sequence.kind === 'criticalDash';
  const times = dash ? [.2, .6, 1] : [0, .25, .5, .75, 1];
  if (dash) {
    // Each pass reaches the boss, then the final leg returns to the captured origin.
    const t = Math.min(1.2, sequence.elapsed);
    const fraction = t <= 1 ? .5 - .5 * Math.cos(t * Math.PI * 5) : (1.2 - t) / .2;
    const dx = sequence.originX - state.boss.x, dz = sequence.originZ - state.boss.z;
    const length = Math.hypot(dx, dz) || 1;
    const endX = state.boss.x + dx / length * 1.2, endZ = state.boss.z + dz / length * 1.2;
    actor.x = sequence.originX + (endX - sequence.originX) * fraction;
    actor.z = sequence.originZ + (endZ - sequence.originZ) * fraction;
    bounds(actor);
  }
  while (sequence.nextHit < times.length && sequence.elapsed + 1e-8 >= times[sequence.nextHit]) {
    const hitIndex = sequence.nextHit++;
    if (!dash && distance(actor, state.boss) > ROLES.hunter.range) continue;
    const dealt = damageBoss(state, slot, dash ? ROLES.vanguard.damage : ROLES.hunter.damage * .4, 'weapon', dash ? 'Critical Dash' : 'Split Volley', sequence.kind, dash, sequence.id, hitIndex);
    if (dealt > 0) {
      grantTp(actor, dash ? 240 : 200);
      if (!dash && sequence.landedHits === 0 && state.status === 'fighting') actor.selfChainUntil = state.time + 8;
      sequence.landedHits++;
    }
    if (!actor.sequence || state.status !== 'fighting') return;
  }
  if (sequence.elapsed + 1e-8 >= (dash ? 1.2 : 1.05)) cancelSequence(actor);
}

function trustAction(state: GameState, slot: number) {
  const actor = state.party[slot];
  const leader = state.party.find(p => p.human && p.hp > 0 && p.engaged) ?? state.party.find(p => p.human && p.hp > 0);
  // A room with no humans remains useful to test full-trust combat after explicit start.
  const active = state.status === 'fighting' && (leader ? leader.engaged : state.party.some(p => p.engaged));
  actor.engaged = active;
  actor.moveX = actor.moveZ = 0;
  if (!active) {
    if (leader) moveToward(actor, leader.x + (slot - 2) * 1.8, leader.z + 2, 1.5);
    return;
  }
  if (actor.sequence) return;
  if (actor.id === 'bacchus') applyAction(state, slot, { type: 'revelry' });
  const cast = state.boss.cast;
  if (actor.role === 'luminary') {
    const urgent = state.party.some(p => p.hp > 0 && p.hp / p.maxHp < .35 && distance(actor, p) <= MAGIC_RANGE);
    if (urgent && applyAction(state, slot, { type: 'heal' }).ok) return;
    if ((state.storm.charge > 0 || cast && (cast.kind === 'raid' || cast.abilityId === 'regentsDecree')) && state.party.some(p => p.hp > 0 && p.shieldCharges === 0 && distance(actor, p) <= MAGIC_RANGE)) applyAction(state, slot, { type: 'aegis' });
    const wounded = state.party.filter(p => p.hp > 0 && p.maxHp - p.hp >= 250 && distance(actor, p) <= MAGIC_RANGE);
    if (wounded.length >= 2) applyAction(state, slot, { type: 'shimmerWave' });
    const sustained = wounded.filter(p => !p.mendingThread && p.maxHp - p.hp >= 500).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (sustained && actor.mp >= 150) applyAction(state, slot, { type: 'mendingThread', target: state.party.indexOf(sustained) });
  }
  if (cast?.abilityId === 'regentsDecree' && cast.target === slot) {
    applyAction(state, slot, { type: 'guard' });
    if (cast.remaining < .55) applyAction(state, slot, { type: 'dodge' });
  }
  if (cast && isInTelegraph(actor, cast)) {
    if (cast.kind === 'raid') {
      if (cast.remaining < 4.5) applyAction(state, slot, { type: 'guard' });
    } else if (cast.kind === 'circle') {
      let dx = actor.x - cast.x, dz = actor.z - cast.z;
      if (Math.hypot(dx, dz) < 0.1) { dx = slot % 2 ? 1 : -1; dz = 0.2; }
      const length = Math.hypot(dx, dz);
      moveToward(actor, cast.x + dx / length * (cast.radius + 1.8), cast.z + dz / length * (cast.radius + 1.8));
      if (cast.remaining < 0.7) applyAction(state, slot, { type: 'dodge' });
      return;
    } else {
      const safeAngle = cast.angle + (slot % 2 ? 1 : -1) * (CONE_HALF_ANGLE + 0.7);
      moveToward(actor, cast.x + Math.sin(safeAngle) * 6, cast.z + Math.cos(safeAngle) * 6);
      if (cast.remaining < 0.7) applyAction(state, slot, { type: 'dodge' });
      return;
    }
  }
  const desiredRange = actor.role === 'arcanist' || actor.role === 'luminary' || actor.role === 'hunter' ? 10 : 3.3;
  const formationAngle = actor.role === 'warden' ? 0 : actor.role === 'hunter' ? Math.PI : slot * 1.2;
  if (distance(actor, state.boss) > desiredRange + 1 || distance(actor, state.boss) < desiredRange - 1.5) {
    moveToward(actor, state.boss.x + Math.sin(formationAngle) * desiredRange, state.boss.z + Math.cos(formationAngle) * desiredRange, 0.3);
  }
  if (actor.role === 'luminary') {
    if (state.party.some(p => p.hp > 0 && p.maxHp - p.hp > 360)) applyAction(state, slot, { type: 'heal' });
  }
  if (actor.role === 'warden') {
    applyAction(state, slot, { type: 'provoke' });
    if (actor.hp < actor.maxHp * 0.72) applyAction(state, slot, { type: 'guard' });
  }
  if (actor.role === 'arcanist') {
    if (actor.mp >= 420 && (state.burst || state.boss.phase >= 2)) applyAction(state, slot, { type: 'rapidWeave' });
    const cycle = actor.elementalCycle.elements;
    const ordered = [...ELEMENTS.filter(e => !cycle.includes(e)), ...cycle];
    if (state.burst) ordered.unshift(state.burst.element);
    for (const element of ordered) if (applyAction(state, slot, { type: 'magic', element }).ok) break;
  }
  if (canUseActionRole(actor.role, 'weapon') && actor.tp >= TP_COST && distance(actor, state.boss) <= ROLES[actor.role].range) {
    const chain = state.chain;
    if (chain && (chain.opener !== slot || actor.selfChainUntil > state.time) && state.time - chain.openedAt >= CHAIN_MIN_DELAY + 0.3) {
      if (applyAction(state, slot, { type: 'weapon', id: WEAPONS[chain.weapon].next }).ok) return;
    } else if (!chain && actor.tp >= 1800) {
      const opener: WeaponId = actor.role === 'hunter' ? 'pierce' : 'cleave';
      if (applyAction(state, slot, { type: 'weapon', id: opener }).ok) return;
    }
  }
  if (actor.role === 'hunter' && actor.tp <= 1750 && (!state.chain || state.chain.opener === slot)) applyAction(state, slot, { type: 'splitVolley' });
  if (actor.role === 'vanguard' && actor.tp <= 2280) applyAction(state, slot, { type: 'criticalDash' });
}

function bossStep(state: GameState, dt: number) {
  const boss = state.boss;
  for (const key of Object.keys(boss.cooldowns)) boss.cooldowns[key] = Math.max(0, boss.cooldowns[key] - dt);
  if (state.mode === 'god' && state.combatTime >= GOD_ENRAGE_TIME - GOD_ENRAGE_CAST) {
    const remaining = Math.max(0, GOD_ENRAGE_TIME - state.combatTime);
    if (remaining > 0) {
      if (boss.cast?.name !== 'Coherence Collapse') event(state, 'cast', 'Coherence Collapse — 10 seconds remain. Defeat Crown Resonance; this collapse cannot be guarded or evaded.', undefined, undefined, undefined, 'collapse');
      boss.cast = { abilityId: 'collapse', name: 'Coherence Collapse', kind: 'raid', x: boss.x, z: boss.z, radius: 100, angle: boss.facing, total: GOD_ENRAGE_CAST, remaining };
    } else {
      event(state, 'enrage', 'Coherence Collapse. The Regent outlasts the party; the local arena gives way.', undefined, undefined, undefined, 'collapse');
      for (let i = 0; i < state.party.length; i++) {
        const actor = state.party[i];
        if (actor.hp > 0) {
          state.runStats.party[i].taken += actor.hp;
          state.runStats.party[i].deaths++;
          event(state, 'down', `${actor.name} is lost to Coherence Collapse.`, i);
        }
        actor.hp = actor.ce = actor.ve = actor.moveX = actor.moveZ = actor.revelryStacks = 0;
        actor.engaged = false;
      }
      finishIfNeeded(state);
    }
    return;
  }
  const candidates = state.party.map((a, i) => ({ a, i })).filter(({ a }) => a.hp > 0 && (a.engaged || a.ce + a.ve > 0));
  candidates.sort((a, b) => (b.a.ce + b.a.ve) - (a.a.ce + a.a.ve) || a.i - b.i);
  boss.target = candidates[0]?.i ?? -1;
  const phase = boss.hp / boss.maxHp <= 0.33 ? 3 : boss.hp / boss.maxHp <= 0.67 ? 2 : 1;
  if (phase !== boss.phase) {
    boss.phase = phase;
    boss.specialTimer = Math.min(boss.specialTimer, 3);
    event(state, 'phase', `Crown Resonance phase ${phase}: ${phase === 2 ? 'Fractured Crown' : 'Terminal Eclipse'}.`);
  }
  if (boss.cast) {
    if (boss.cast.abilityId === 'regentsDecree' && boss.cast.target !== undefined) {
      const marked = state.party[boss.cast.target];
      boss.cast.x = marked.x; boss.cast.z = marked.z;
    }
    boss.cast.remaining = Math.max(0, boss.cast.remaining - dt);
    if (boss.cast.remaining <= 1e-8) {
      const cast = boss.cast;
      // Copy the committed area before the cast clears or a second pulse mutates it.
      event(state, 'boss_impact', `${cast.name} resolves.`, undefined, undefined, cast.target, cast.abilityId, undefined, undefined, undefined, { abilityId: cast.abilityId ?? 'bossImpact', area: castArea(cast) });
      const decree = cast.abilityId === 'regentsDecree';
      const echo = cast.abilityId === 'terminalEcho';
      const base = decree ? 1000 : echo ? 300 : cast.kind === 'raid' ? 260 : cast.kind === 'cone' ? 620 : 740;
      for (let i = 0; i < state.party.length; i++) {
        if (decree ? i === cast.target : isInTelegraph(state.party[i], cast)) damageActor(state, i, base * 1.05 * (1 + (boss.phase - 1) * 0.15) * (state.mode === 'god' ? 1.1 : 1), cast.name, decree || cast.kind === 'cone');
      }
      if (echo && (cast.pulses ?? 1) > 1) {
        cast.pulses = 1;
        cast.total = cast.remaining = 1;
      } else boss.cast = null;
      finishIfNeeded(state);
    }
    return;
  }
  // A committed cast completes even after its threat target falls or disengages.
  // Only acquiring a new attack requires a living engaged/enmity-bearing target.
  if (boss.target < 0) return;
  const target = state.party[boss.target];
  boss.facing = Math.atan2(target.x - boss.x, target.z - boss.z);
  if (distance(boss, target) > 3.7) {
    const length = distance(boss, target);
    boss.x += (target.x - boss.x) / length * 2.3 * dt;
    boss.z += (target.z - boss.z) / length * 2.3 * dt;
  }
  boss.attackTimer -= dt;
  boss.specialTimer -= dt;
  if (boss.attackTimer <= 0 && distance(boss, target) <= 4.3) {
    damageActor(state, boss.target, 180 * 1.05 * (1 + (boss.phase - 1) * 0.15), 'Crown strike', true);
    boss.attackTimer = 2.7 - boss.phase * 0.15;
    finishIfNeeded(state);
  }
  if (state.status !== 'fighting' || boss.specialTimer > 0) return;
  const abilities = [
    { id: 'nullBloom', name: 'Null Impact', kind: 'circle' as const, total: 3, radius: 5, cooldown: 18 },
    { id: 'severingArc', name: 'Crown Sever', kind: 'cone' as const, total: 3, radius: 12, cooldown: 20 },
    { id: 'resonantPulse', name: 'Terminal Pulse', kind: 'raid' as const, total: 4, radius: 100, cooldown: 30 },
    ...(boss.phase >= 2 ? [{ id: 'regentsDecree', name: "Regent's Decree", kind: 'circle' as const, total: 3, radius: 0, cooldown: 35 }] : []),
    ...(boss.phase >= 3 ? [{ id: 'terminalEcho', name: 'Terminal Echo', kind: 'raid' as const, total: 4, radius: 100, cooldown: 40 }] : []),
  ];
  for (let offset = 0; offset < abilities.length; offset++) {
    const index = (boss.castCount + offset) % abilities.length;
    const ability = abilities[index];
    if ((boss.cooldowns[ability.id] ?? 0) > 1e-8) continue;
    boss.castCount += offset + 1;
    boss.cooldowns[ability.id] = ability.cooldown;
    boss.cast = {
      abilityId: ability.id, name: ability.name, kind: ability.kind, total: ability.total, remaining: ability.total,
      x: ability.kind === 'circle' ? target.x : boss.x, z: ability.kind === 'circle' ? target.z : boss.z,
      radius: ability.radius, angle: boss.facing,
      ...(ability.id === 'regentsDecree' ? { target: boss.target } : {}),
      ...(ability.id === 'terminalEcho' ? { pulses: 2 } : {}),
    };
    boss.specialTimer = 12 - boss.phase;
    event(state, 'cast', `${ability.name} — ${ability.id === 'regentsDecree' ? 'protect the marked ally' : ability.kind === 'raid' ? 'guard the pulse' : ability.kind === 'cone' ? 'leave the cone' : 'leave the marked ground'}.`, undefined, undefined, ability.id === 'regentsDecree' ? boss.target : undefined, ability.id, undefined, undefined, undefined, { area: castArea(boss.cast) });
    break;
  }
}

function restoreHealth(state: GameState, source: number, target: number, base: number, ability: string) {
  const caster = state.party[source], recipient = state.party[target];
  const amount = Math.min(recipient.maxHp - recipient.hp, Math.round(base * TRAITS[caster.role].healingPower / 100 * (recipient.hp / recipient.maxHp < .35 ? 1.2 : 1)));
  if (amount <= 0 || recipient.hp <= 0) return;
  recipient.hp += amount;
  state.runStats.party[source].healing += amount;
  if (caster.hp > 0) threat(caster, amount * .16 * .75, amount * .4 * .75);
  event(state, 'heal', `${caster.name}: ${ABILITY_DEFINITIONS[ability].name} restores ${recipient.name} · +${amount}`, source, amount, target, ability);
}

function stormStep(state: GameState, dt: number) {
  const storm = state.storm;
  storm.remaining = Math.max(0, storm.remaining - dt);
  if (storm.charge > 0) {
    storm.charge = Math.max(0, storm.charge - dt);
    if (storm.charge <= 1e-8) {
      storm.charge = 0;
      const targets = staticArcTargets(state);
      event(state, 'static_discharge', targets.length ? 'Static discharge — spread out!' : 'Static discharge grounds harmlessly.', undefined, undefined, undefined, 'staticStorm');
      targets.forEach((target, jump) => {
        event(state, 'static_arc', `Static arcs to ${state.party[target].name}.`, target, undefined, jump > 0 ? targets[jump - 1] : undefined, 'staticStorm');
        damageActor(state, target, 420 * Math.pow(.75, jump), 'Static arc');
      });
      finishIfNeeded(state);
      if (state.status !== 'fighting') return;
    }
  }
  if (storm.remaining <= 1e-8) {
    storm.charge = STATIC_CHARGE_SECONDS;
    storm.remaining = nextStaticInterval(storm);
    event(state, 'static_strike', 'Lightning charges the enemy — spread out or prepare Aegis!', undefined, undefined, undefined, 'staticStorm');
  }
}

function fixedStep(state: GameState) {
  const dt = FIXED_STEP;
  state.time = ++state.tick * dt;
  if (state.status === 'fighting') {
    const previous = state.combatTime;
    state.combatTime = Math.round((state.combatTime + dt) / dt) * dt;
    if (state.mode === 'god' && previous < GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING && state.combatTime >= GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING) event(state, 'warning', 'Coherence Collapse approaches — 30 seconds remain. Finish Crown Resonance.');
  }
  if (state.chain) {
    state.chain.remaining = Math.max(0, CHAIN_WINDOW - (state.time - state.chain.openedAt));
    if (state.chain.remaining <= 1e-8) state.chain = null;
  }
  if (state.burst) {
    state.burst.remaining = Math.max(0, state.burst.remaining - dt);
    if (state.burst.remaining <= 1e-8) state.burst = null;
  }
  for (let i = 0; i < state.party.length; i++) {
    const actor = state.party[i];
    for (const key of Object.keys(actor.cooldowns)) actor.cooldowns[key] = Math.max(0, actor.cooldowns[key] - dt);
    actor.recovery = Math.max(0, actor.recovery - dt);
    actor.spellRecovery = Math.max(0, actor.spellRecovery - dt);
    if (actor.hp <= 0) { clearTransient(actor); continue; }
    if (actor.mendingThread && state.status === 'fighting') {
      const thread = actor.mendingThread;
      thread.remaining = Math.max(0, thread.remaining - dt);
      thread.tickIn -= dt;
      if (thread.tickIn <= 1e-8) { restoreHealth(state, thread.source, i, 100, 'mendingThread'); thread.tickIn += 2; }
      if (thread.remaining <= 1e-8) actor.mendingThread = null;
    }
    if (actor.rapidWeave) {
      actor.rapidWeave.remaining -= dt;
      for (const element of ELEMENTS) actor.rapidWeave.refresh[element] = Math.max(0, actor.rapidWeave.refresh[element] - dt);
      if (actor.rapidWeave.remaining <= 1e-8) actor.rapidWeave = null;
    }
    actor.elementalCycle.remaining = Math.max(0, actor.elementalCycle.remaining - dt);
    if (actor.elementalCycle.remaining <= 1e-8) actor.elementalCycle = { elements: [], remaining: 0 };
    actor.ve = Math.max(0, actor.ve - 120 * dt);
    actor.mp = Math.min(actor.maxMp, actor.mp + (state.status === 'fighting' ? 13 : 40) * dt);
    if (!actor.human) {
      actor.aiTimer -= dt;
      if (actor.aiTimer <= 1e-8) { trustAction(state, i); actor.aiTimer = 0.2; }
    }
    if (actor.sequence) {
      sequenceStep(state, i, dt);
      continue;
    }
    actor.x += actor.moveX * MOVE_SPEED * dt;
    actor.z += actor.moveZ * MOVE_SPEED * dt;
    bounds(actor);
    if (state.status !== 'fighting') continue;
    actor.attackTimer = Math.max(0, actor.attackTimer - dt);
    if (actor.engaged && actor.attackTimer <= 1e-8 && distance(actor, state.boss) <= ROLES[actor.role].range) {
      const role = ROLES[actor.role];
      const dealt = damageBoss(state, i, role.damage, 'auto', 'auto attack');
      if (dealt > 0) grantTp(actor, role.tp);
      if (state.status === 'fighting' && TRAITS[actor.role].extraHitChance > 0 && random(state) < TRAITS[actor.role].extraHitChance) {
        if (damageBoss(state, i, role.damage * .5, 'auto', 'extra attack', 'extraHit') > 0) grantTp(actor, role.tp * .5);
      }
      actor.attackTimer = ROLES[actor.role].delay;
    }
  }
  if (state.status === 'fighting') stormStep(state, dt);
  if (state.status === 'fighting') bossStep(state, dt);
}

/** Bounded deterministic catch-up: callers submit elapsed seconds, never wall-clock state. */
export function stepGame(state: GameState, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0 || dtSeconds > 30 || state.status === 'victory' || state.status === 'defeat') return;
  state.remainder += dtSeconds;
  let steps = Math.floor((state.remainder + 1e-9) / FIXED_STEP);
  state.remainder = Math.max(0, state.remainder - steps * FIXED_STEP);
  while (steps-- > 0 && (state.status === 'ready' || state.status === 'fighting')) fixedStep(state);
}
