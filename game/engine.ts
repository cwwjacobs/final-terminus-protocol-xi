import { ARENA_RADIUS, BURST_WINDOW, canUseActionRole, CHAIN_MIN_DELAY, CHAIN_WINDOW, CONE_HALF_ANGLE, FIXED_STEP, GOD_ENRAGE_CAST, GOD_ENRAGE_TIME, GOD_ENRAGE_WARNING, MAGIC, MAGIC_RANGE, MOVE_SPEED, PARTY, ROLES, SKILLCHAINS, TP_COST, TP_MAX, WEAPONS } from './content.ts';
import { LORE } from './lore.ts';
import type { Action, ActionResult, Actor, BossCast, GameState, Mode, WeaponId } from './types.ts';

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const fail = (error: string): ActionResult => ({ ok: false, error });

function event(state: GameState, kind: string, text: string, actor?: number, value?: number) {
  state.events.push({ id: ++state.eventSeq, time: state.combatTime, kind, text, ...(actor === undefined ? {} : { actor }), ...(value === undefined ? {} : { value }) });
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
}

export function createGame(mode: Mode = 'trial'): GameState {
  const safeMode = mode === 'god' ? 'god' : 'trial';
  const maxHp = safeMode === 'god' ? 240000 : 75000;
  return {
    version: 1, time: 0, combatTime: 0, tick: 0, remainder: 0, eventSeq: 0, mode: safeMode, status: 'ready',
    party: PARTY.map((p, i) => ({
      id: p.id, name: p.name, role: p.role, color: p.color,
      x: (i - 2) * 2, z: 9 + Math.abs(i - 2), facing: Math.PI,
      hp: p.hp, maxHp: p.hp, mp: p.mp, maxMp: p.mp, tp: 0,
      human: i === 0, engaged: false, moveX: 0, moveZ: 0, ce: 0, ve: 0,
      cooldowns: {}, attackTimer: 0, guardUntil: 0, dodgeUntil: 0, aiTimer: 0,
    })),
    boss: { name: LORE.boss, x: 0, z: -4, hp: maxHp, maxHp, target: -1, phase: 1, facing: 0, attackTimer: 2.5, specialTimer: 9, castCount: 0, cast: null },
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
  actor.ce = clamp(actor.ce + cumulative, 0, 10000);
  actor.ve = clamp(actor.ve + volatile, 0, 10000);
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
    actor.engaged = false;
    actor.moveX = 0;
    actor.moveZ = 0;
  }
}

function damageBoss(state: GameState, slot: number, amount: number, kind: string, label: string) {
  const damage = Math.min(state.boss.hp, Math.round(amount));
  state.boss.hp -= damage;
  threat(state.party[slot], damage * 0.65, damage * 0.8);
  event(state, kind, `${state.party[slot].name}: ${label} · ${damage}`, slot, damage);
  finishIfNeeded(state);
}

function damageActor(state: GameState, slot: number, amount: number, label: string) {
  const actor = state.party[slot];
  if (actor.hp <= 0) return;
  if (actor.dodgeUntil > state.time) {
    event(state, 'evade', `${actor.name} evades ${label}.`, slot);
    return;
  }
  const damage = Math.min(actor.hp, Math.round(amount * (actor.guardUntil > state.time ? 0.35 : 1)));
  actor.hp -= damage;
  actor.ce = Math.max(0, actor.ce - damage * 0.7);
  actor.tp = Math.min(TP_MAX, actor.tp + 45);
  event(state, 'hit', `${actor.name}: ${label} · −${damage}`, slot, damage);
  if (actor.hp <= 0) {
    actor.engaged = false;
    actor.ce = actor.ve = actor.moveX = actor.moveZ = 0;
    event(state, 'down', `${actor.name} falls.`, slot);
  }
}

function begin(state: GameState, slot: number) {
  state.status = 'fighting';
  state.combatTime = 0;
  state.party[slot].engaged = true;
  threat(state.party[slot], 1, 1);
  event(state, 'start', `${state.party[slot].name} engages the Crown Resonance.`, slot);
  if (state.mode === 'god') event(state, 'warning', 'Coherence Collapse in 7:30. Defeat Crown Resonance before the local arena collapses.');
}

/** Untrusted runtime inputs are validated before any state mutation. */
export function applyAction(state: GameState, slot: number, action: Action): ActionResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.party.length) return fail('Invalid party slot.');
  if (!action || typeof action !== 'object' || Array.isArray(action)) return fail('Invalid action.');
  const type = action.type;
  if (typeof type !== 'string' || !['move', 'engage', 'weapon', 'magic', 'provoke', 'heal', 'guard', 'dodge', 'start'].includes(type)) return fail('Unknown action.');
  if (state.status === 'victory' || state.status === 'defeat') return fail('The encounter is over.');
  const actor = state.party[slot];
  if (actor.hp <= 0) return fail('This actor has fallen.');
  if (!canUseActionRole(actor.role, type)) return fail(`${actor.name} cannot use ${type} as a ${actor.role}.`);

  if (action.type === 'move') {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.z) || Math.abs(action.x) > 100 || Math.abs(action.z) > 100 || (action.facing !== undefined && !Number.isFinite(action.facing))) return fail('Movement must contain finite, bounded numbers.');
    const length = Math.max(1, Math.hypot(action.x, action.z));
    actor.moveX = action.x / length;
    actor.moveZ = action.z / length;
    if (action.facing !== undefined) actor.facing = angleDifference(action.facing, 0);
    else if (length > 1 || Math.abs(action.x) + Math.abs(action.z) > 0.001) actor.facing = Math.atan2(action.x, action.z);
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
  if ((actor.cooldowns[type] ?? 0) > 0) return fail(`${type} is on cooldown.`);

  if (action.type === 'weapon') {
    if (typeof action.id !== 'string' || !Object.hasOwn(WEAPONS, action.id)) return fail('Unknown weaponskill.');
    if (!actor.engaged) return fail('Engage before using a weaponskill.');
    if (distance(actor, state.boss) > ROLES[actor.role].range) return fail('Move into weaponskill range.');
    if (actor.tp < TP_COST) return fail('A weaponskill requires 1,000 TP.');
    const spent = actor.tp;
    actor.tp = 0;
    actor.cooldowns.weapon = 2;
    const def = WEAPONS[action.id];
    const damage = def.damage * (1 + (spent - TP_COST) / 4000);
    const previous = state.chain;
    const combination = previous && previous.opener !== slot && state.time - previous.openedAt + 1e-8 >= CHAIN_MIN_DELAY && previous.remaining > 0 ? SKILLCHAINS[`${previous.weapon}:${action.id}`] : undefined;
    damageBoss(state, slot, damage, 'weapon', def.name);
    if (state.status !== 'fighting') return { ok: true };
    if (combination) {
      damageBoss(state, slot, damage * 0.9, 'chain', `${combination.property} skillchain`);
      if (state.status === 'fighting') state.burst = { element: combination.element, remaining: BURST_WINDOW };
    }
    if (state.status === 'fighting') state.chain = { property: combination?.property ?? def.property, opener: slot, weapon: action.id, remaining: CHAIN_WINDOW, openedAt: state.time };
    return { ok: true };
  }
  if (action.type === 'magic') {
    if (typeof action.element !== 'string' || !Object.hasOwn(MAGIC, action.element)) return fail('Unknown magic element.');
    if (distance(actor, state.boss) > MAGIC_RANGE) return fail('Move into magic range.');
    if (actor.mp < 70) return fail('Magic requires 70 MP.');
    actor.mp -= 70;
    actor.cooldowns.magic = 7;
    const burst = state.burst?.element === action.element && state.burst.remaining > 0;
    damageBoss(state, slot, burst ? 1020 : 250, burst ? 'burst' : 'magic', `${MAGIC[action.element].name}${burst ? ' · MAGIC BURST' : ''}`);
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
    const target = targets[0];
    if (!target) return fail('No wounded ally in range.');
    const restored = Math.min(target.p.maxHp - target.p.hp, 690);
    target.p.hp += restored;
    actor.mp -= 70;
    actor.cooldowns.heal = 5;
    threat(actor, restored * 0.16, restored * 0.4);
    event(state, 'heal', `${actor.name} restores ${target.p.name} · +${Math.round(restored)}`, slot, restored);
    return { ok: true };
  }
  if (action.type === 'guard') {
    actor.cooldowns.guard = 14;
    actor.guardUntil = state.time + 5;
    event(state, 'guard', `${actor.name} anchors a ward.`, slot);
    return { ok: true };
  }
  if (action.type === 'dodge') {
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
  const cast = state.boss.cast;
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
    if (state.burst) applyAction(state, slot, { type: 'magic', element: state.burst.element });
    else if (!state.chain && actor.mp > 200) applyAction(state, slot, { type: 'magic', element: 'lightning' });
  }
  if (canUseActionRole(actor.role, 'weapon') && actor.tp >= TP_COST && distance(actor, state.boss) <= ROLES[actor.role].range) {
    const chain = state.chain;
    if (chain && chain.opener !== slot && state.time - chain.openedAt >= CHAIN_MIN_DELAY + 0.3) {
      applyAction(state, slot, { type: 'weapon', id: WEAPONS[chain.weapon].next });
    } else if (!chain && actor.tp >= 1800) {
      const opener: WeaponId = actor.role === 'hunter' ? 'pierce' : 'cleave';
      applyAction(state, slot, { type: 'weapon', id: opener });
    }
  }
}

function bossStep(state: GameState, dt: number) {
  const boss = state.boss;
  if (state.mode === 'god' && state.combatTime >= GOD_ENRAGE_TIME - GOD_ENRAGE_CAST) {
    const remaining = Math.max(0, GOD_ENRAGE_TIME - state.combatTime);
    if (remaining > 0) {
      if (boss.cast?.name !== 'Coherence Collapse') event(state, 'cast', 'Coherence Collapse — 10 seconds remain. Defeat Crown Resonance; this collapse cannot be guarded or evaded.');
      boss.cast = { name: 'Coherence Collapse', kind: 'raid', x: boss.x, z: boss.z, radius: 100, angle: boss.facing, total: GOD_ENRAGE_CAST, remaining };
    } else {
      event(state, 'enrage', 'Coherence Collapse. The Regent outlasts the party; the local arena gives way.');
      for (let i = 0; i < state.party.length; i++) {
        const actor = state.party[i];
        if (actor.hp > 0) event(state, 'down', `${actor.name} is lost to Coherence Collapse.`, i);
        actor.hp = actor.ce = actor.ve = actor.moveX = actor.moveZ = 0;
        actor.engaged = false;
      }
      finishIfNeeded(state);
    }
    return;
  }
  const candidates = state.party.map((a, i) => ({ a, i })).filter(({ a }) => a.hp > 0 && (a.engaged || a.ce + a.ve > 0));
  candidates.sort((a, b) => (b.a.ce + b.a.ve) - (a.a.ce + a.a.ve) || a.i - b.i);
  boss.target = candidates[0]?.i ?? -1;
  if (boss.target < 0) return;
  const target = state.party[boss.target];
  const phase = boss.hp / boss.maxHp <= 0.33 ? 3 : boss.hp / boss.maxHp <= 0.67 ? 2 : 1;
  if (phase !== boss.phase) {
    boss.phase = phase;
    boss.specialTimer = Math.min(boss.specialTimer, 3);
    event(state, 'phase', `Crown Resonance phase ${phase}: ${phase === 2 ? 'Fractured Crown' : 'Terminal Eclipse'}.`);
  }
  if (boss.cast) {
    boss.cast.remaining = Math.max(0, boss.cast.remaining - dt);
    if (boss.cast.remaining <= 1e-8) {
      const cast = boss.cast;
      const base = cast.kind === 'raid' ? 260 : cast.kind === 'cone' ? 620 : 740;
      for (let i = 0; i < state.party.length; i++) if (isInTelegraph(state.party[i], cast)) damageActor(state, i, base * (1 + (boss.phase - 1) * 0.15) * (state.mode === 'god' ? 1.1 : 1), cast.name);
      boss.cast = null;
      finishIfNeeded(state);
    }
    return;
  }
  boss.facing = Math.atan2(target.x - boss.x, target.z - boss.z);
  if (distance(boss, target) > 3.7) {
    const length = distance(boss, target);
    boss.x += (target.x - boss.x) / length * 2.3 * dt;
    boss.z += (target.z - boss.z) / length * 2.3 * dt;
  }
  boss.attackTimer -= dt;
  boss.specialTimer -= dt;
  if (boss.attackTimer <= 0 && distance(boss, target) <= 4.3) {
    damageActor(state, boss.target, 180 * (1 + (boss.phase - 1) * 0.15), 'Crown strike');
    boss.attackTimer = 2.7 - boss.phase * 0.15;
    finishIfNeeded(state);
  }
  if (state.status !== 'fighting' || boss.specialTimer > 0) return;
  const sequence = boss.castCount++ % 3;
  const kind = sequence === 0 ? 'circle' : sequence === 1 ? 'cone' : 'raid';
  const name = kind === 'circle' ? 'Null Impact' : kind === 'cone' ? 'Crown Sever' : 'Terminal Pulse';
  const total = kind === 'raid' ? 4 : 3;
  boss.cast = { name, kind, total, remaining: total, x: kind === 'circle' ? target.x : boss.x, z: kind === 'circle' ? target.z : boss.z, radius: kind === 'raid' ? 100 : kind === 'circle' ? 5 : 12, angle: boss.facing };
  boss.specialTimer = 12 - boss.phase;
  event(state, 'cast', `${name} — ${kind === 'raid' ? 'guard the pulse' : kind === 'cone' ? 'leave the cone' : 'leave the marked ground'}.`);
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
    if (actor.hp <= 0) continue;
    actor.ve = Math.max(0, actor.ve - 120 * dt);
    actor.mp = Math.min(actor.maxMp, actor.mp + (state.status === 'fighting' ? 13 : 40) * dt);
    for (const key of Object.keys(actor.cooldowns)) {
      const remaining = actor.cooldowns[key] - dt;
      actor.cooldowns[key] = remaining < 1e-8 ? 0 : remaining;
    }
    if (!actor.human) {
      actor.aiTimer -= dt;
      if (actor.aiTimer <= 1e-8) { trustAction(state, i); actor.aiTimer = 0.2; }
    }
    actor.x += actor.moveX * MOVE_SPEED * dt;
    actor.z += actor.moveZ * MOVE_SPEED * dt;
    bounds(actor);
    if (state.status !== 'fighting') continue;
    actor.attackTimer = Math.max(0, actor.attackTimer - dt);
    if (actor.engaged && actor.attackTimer <= 1e-8 && distance(actor, state.boss) <= ROLES[actor.role].range) {
      damageBoss(state, i, ROLES[actor.role].damage, 'auto', 'auto attack');
      actor.tp = Math.min(TP_MAX, actor.tp + ROLES[actor.role].tp);
      actor.attackTimer = ROLES[actor.role].delay;
    }
  }
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
