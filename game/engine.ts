import { COLLAPSE_SECONDS, DESCENT_SECONDS, descentReadiness, offensiveTarget, SENTINEL_ENTRY_SECONDS, SENTINEL_NAMES, sentinelEntryActive, sequenceLocked } from './logos.ts';
import { ABILITY_DEFINITIONS, actionUnavailable, ARENA_RADIUS, ATTACK_BASELINE, BURST_WINDOW, canUseActionRole, CHAIN_MIN_DELAY, CHAIN_WINDOW, CONE_HALF_ANGLE, cooldownKey, DEFAULT_SEED, ELEMENTS, FIXED_STEP, getAttackStats, GOD_ENRAGE_CAST, GOD_ENRAGE_TIME, GOD_ENRAGE_WARNING, MAGIC, MAGIC_RANGE, MOVE_SPEED, PARTY, REVELRY, ROLES, SKILLCHAINS, TP_COST, TP_MAX, TRAITS, WEAPONS } from './content.ts';
import { LORE } from './lore.ts';
import { createRunStats } from './run-stats.ts';
import { GROUND_BALANCE, GROUND_EMERGE_SECONDS, isGroundEnemy, nextGroundWave } from './ground-enemies.ts';
import { createStaticStorm, nextStaticInterval, selectStaticStrike, STATIC_CHARGE_SECONDS, STATIC_REFLECT_DAMAGE, STATIC_RETALIATION_DAMAGE, STATIC_SHOCK_SECONDS, staticArcTargets } from './static-storm.ts';
import { DUSK_WINDOW, isUltimate, matchesBurst, ULTIMATES } from './content.ts';
import { ARCANIST_ENMITY_CAP, DPS_PASSIVES, ENMITY_CAP, WEAPON_ELEMENTS } from './content.ts';
import type { Action, ActionResult, Actor, BossCast, CombatPresentationMetadata, Enemy, EnemyStatus, GameState, Mode, WeaponId } from './types.ts';

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
  // Stronger DPS passives target 80–180s Trial / 240–450s God active play.
  // Shift part of the encounter's health budget into eight finite ground shards.
  const maxHp = safeMode === 'god' ? 297000 : 97000;
  return {
    version: 2, rng: seed >>> 0, sequenceSeq: 0, time: 0, combatTime: 0, tick: 0, remainder: 0, eventSeq: 0, mode: safeMode, status: 'ready', runStats: createRunStats(PARTY.length),
    encounter: 'crown', logos: { stage: 'none', elapsed: 0 }, ultimatesUnlocked: false, duskRemaining: 0, enemies: [],
    storm: createStaticStorm(seed),
    party: PARTY.map((p, i) => ({
      id: p.id, name: p.name, role: p.role, color: p.color,
      x: (i - 2) * 2, z: 9 + Math.abs(i - 2), facing: Math.PI,
      hp: p.hp, maxHp: p.hp, mp: p.mp, maxMp: p.mp, tp: 0, revelryStacks: 0,
      human: i === 0, engaged: false, moveX: 0, moveZ: 0, ce: 0, ve: 0,
      cooldowns: {}, attackTimer: 0, guardUntil: 0, dodgeUntil: 0, aiTimer: 0,
      shieldCharges: 0, hpShield: 0, criticalCharges: 0, sonOfZeus: false, staticShock: 0, mendingThread: null, recovery: 0, spellRecovery: 0, shotElement: 'fire', enemyTarget: 'boss', selfChainUntil: 0,
      rapidWeave: null, elementalCycle: { elements: [], remaining: 0 }, sequence: null,
    })),
    boss: { name: LORE.boss, x: 0, z: -4, hp: maxHp, maxHp, target: -1, phase: 1, facing: 0, attackTimer: 2.5, specialTimer: 9, castCount: 0, cooldowns: {}, cast: null, stunRemaining: 0, burn: null },
    chain: null, burst: null, events: [],
  };
}

export function setHuman(state: GameState, slot: number, human: boolean): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.party.length || typeof human !== 'boolean') return;
  const actor = state.party[slot];
  if (actor.human === human) return;
  actor.human = human;
  if (state.logos.readySlots?.includes(slot)) state.logos.readySlots = state.logos.readySlots.filter(readySlot => readySlot !== slot);
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
  const multiplier = actor.role === 'warden' && actor.sonOfZeus ? 1.3 : TRAITS[actor.role].enmity;
  const cap = actor.role === 'arcanist' ? ARCANIST_ENMITY_CAP : ENMITY_CAP;
  actor.ce = clamp(actor.ce + cumulative * multiplier, 0, cap);
  actor.ve = clamp(actor.ve + volatile * multiplier, 0, cap);
}

function compareThreat(a: { a: Actor; i: number }, b: { a: Actor; i: number }) {
  return (b.a.ce + b.a.ve) - (a.a.ce + a.a.ve) || Number(b.a.role === 'warden') - Number(a.a.role === 'warden') || a.i - b.i;
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
  actor.hpShield = 0;
  actor.criticalCharges = 0;
  actor.sonOfZeus = false;
  actor.staticShock = 0;
  actor.mendingThread = null;
  actor.selfChainUntil = 0;
  actor.rapidWeave = null;
  actor.elementalCycle = { elements: [], remaining: 0 };
}

function beginSentinels(state: GameState) {
  state.logos = { stage: 'sentinels', elapsed: 0 };
  state.combatTime = 0; state.runStats = createRunStats(state.party.length);
  event(state, 'sentinels_awaken', 'The six distant statues leap into the arena around the party.');
  const ariadne = state.party.findIndex(actor => actor.id === 'ariadne');
  event(state, 'lair_question', 'Logos..?', ariadne >= 0 ? ariadne : undefined);
}

function beginGiant(state: GameState) {
  state.logos = { stage: 'giant', elapsed: 0 }; state.ultimatesUnlocked = true;
  state.chain = state.burst = null; state.duskRemaining = 0;
  Object.assign(state.boss, { x: 0, z: -12, hp: state.boss.maxHp, target: 1, phase: 1, facing: 0, attackTimer: 3, specialTimer: 8, castCount: 0, cooldowns: {}, cast: null, stunRemaining: 0, burn: null });
  state.enemies = [-1, 1].map((sign, i) => ({ id: i === 0 ? 'left-hand' : 'right-hand', name: i === 0 ? 'Logos · Left hand' : 'Logos · Right hand', x: sign * 7, z: -3, hp: 8000, maxHp: 8000, target: 1, attackTimer: 4 + i, stunRemaining: 0, burn: null }));
  state.party.forEach(a => { a.hp = a.maxHp; a.mp = a.maxMp; a.enemyTarget = a.role === 'warden' ? 'left-hand' : a.role === 'vanguard' ? 'right-hand' : 'boss'; a.engaged = true; a.aiTimer = 0; });
  event(state, 'awakening', 'Logos attacks — hold his hands; ranged heroes strike his head. Divine ultimates unlocked.');
}

function finishIfNeeded(state: GameState) {
  if (state.status !== 'fighting') return;
  if (state.logos.stage === 'sentinels' && !sentinelEntryActive(state) && state.enemies.every(e => e.hp <= 0)) {
    beginGiant(state); return;
  }
  if (state.boss.hp <= 0 && state.logos.stage === 'giant') {
    state.logos = { stage: 'collapse', elapsed: 0 }; state.boss.cast = null; state.boss.burn = null;
    state.enemies.forEach(e => { e.hp = 0; e.burn = null; });
    state.party.forEach(a => { a.engaged = false; a.moveX = a.moveZ = 0; cancelSequence(a); });
    event(state, 'coherence_collapse', 'Logos loses coherence. The floor is disappearing — get clear!'); return;
  }
  if (state.logos.stage === 'collapse') return;
  if (state.boss.hp <= 0) {
    state.status = 'victory';
    state.boss.hp = 0;
    state.boss.cast = null;
    state.chain = null;
    state.burst = null;
    state.duskRemaining = 0;
    state.enemies.forEach(enemy => { enemy.hp = 0; enemy.burn = null; });
    state.boss.burn = null;
    event(state, 'victory', state.encounter === 'logos' ? 'Logos loses coherence. His scaffolding flickers; he survives beyond the party’s sight.' : 'Crown Resonance dispersed. The path to Logos opens.');
  } else if (state.party.every(a => a.hp <= 0)) {
    state.status = 'defeat';
    state.boss.cast = null;
    state.chain = null;
    state.burst = null;
    state.duskRemaining = 0;
    event(state, 'defeat', 'The party has fallen. Reassemble the protocol.');
  }
  if (state.status !== 'fighting') for (const actor of state.party) {
    const keepForm = state.status === 'victory' && actor.sonOfZeus;
    clearTransient(actor);
    actor.sonOfZeus = keepForm;
    actor.engaged = false;
    actor.moveX = 0;
    actor.moveZ = 0;
  }
}

function damageBoss(state: GameState, slot: number, amount: number, kind: 'auto' | 'weapon' | 'chain' | 'magic' | 'burst', label: string, source?: string, guaranteedCritical = false, sequenceId?: number, hitIndex?: number, metadata: CombatPresentationMetadata = {}, criticalScale = guaranteedCritical ? 2 : 1.5): number {
  const enemy = metadata.enemyId === 'boss' ? state.boss : metadata.enemyId ? state.enemies.find(enemy => enemy.id === metadata.enemyId) : offensiveTarget(state, state.party[slot]);
  if (enemy === state.boss && state.logos.stage === 'sentinels') return 0;
  if (enemy && 'id' in enemy) metadata = { ...metadata, enemyId: enemy.id };
  if (state.status !== 'fighting' || !enemy || enemy.hp <= 0 || state.party[slot].hp <= 0) return 0;
  if (sentinelEntryActive(state)) return 0;
  if ('id' in enemy && (enemy.emergeRemaining ?? 0) > 0) return 0;
  const actor = state.party[slot];
  // These passives reward landed kit hits only: no autos, chain echoes, or AoE ultimate refunds.
  const passive = actor.role === 'vanguard' || actor.role === 'hunter' ? DPS_PASSIVES[actor.role] : undefined;
  const abilityHit = !!passive && (metadata.abilityId?.startsWith('weapon:') || source === 'criticalDash' || source === 'splitVolley' || source === 'elementalShot');
  const stats = getAttackStats(actor);
  const attack = kind === 'chain' || kind === 'magic' || kind === 'burst' ? stats.matk : stats.patk;
  const physical = kind === 'auto' || kind === 'weapon';
  const empowered = kind !== 'chain' && !['rainOfFireBurn', 'static_reflect', 'static_retaliation'].includes(source ?? '') && actor.criticalCharges > 0;
  const critical = guaranteedCritical || empowered || (physical && TRAITS[actor.role].critChance > 0 && random(state) < TRAITS[actor.role].critChance);
  const multiplier = critical ? criticalScale : 1;
  const headExposed = enemy === state.boss && state.logos.stage === 'giant' && state.enemies.some(e => e.id.endsWith('-hand')) && state.enemies.every(e => e.hp <= 0 || e.target >= 0 && ['warden', 'vanguard'].includes(state.party[e.target].role));
  const elementalModifier = abilityHit && metadata.element ? passive!.elementalModifier : 1;
  const damage = Math.min(enemy.hp, Math.round(amount * elementalModifier * (headExposed ? 2 : 1) * attack / ATTACK_BASELINE * multiplier * (kind === 'burst' && actor.role === 'arcanist' ? 1.1 : 1)));
  enemy.hp -= damage;
  if ('id' in enemy && isGroundEnemy(enemy) && enemy.hp <= 0) event(state, 'ground_shatter', `${enemy.name} falls back into the ground.`, slot, undefined, undefined, undefined, undefined, undefined, undefined, { enemyId: enemy.id });
  if ('id' in enemy && enemy.id.endsWith('-hand') && enemy.hp <= 0) { enemy.attackTimer = 12; event(state, 'hand_broken', `${enemy.name} is staggered for 12 seconds. The head is exposed.`, slot); }
  if (damage > 0 && empowered) {
    actor.criticalCharges--;
    if (actor.id === 'bacchus') actor.tp = TP_MAX;
  }
  if (damage > 0 && abilityHit && source !== 'splitVolley') grantTp(actor, passive!.tpPerHit);
  state.runStats.party[slot].damage += damage;
  threat(state.party[slot], damage * 0.65, damage * 0.8);
  event(state, kind, `${actor.name}: ${label}${metadata.enemyId ? ` → ${enemy.name}` : ''} · ${damage}`, slot, damage, undefined, source, physical || empowered || guaranteedCritical ? critical : undefined, sequenceId, hitIndex, metadata);
  finishIfNeeded(state);
  return damage;
}

function staticCounter(state: GameState, slot: number, enemyId: string, amount: number, source: 'static_reflect' | 'static_retaliation') {
  const dealt = damageBoss(state, slot, amount, 'magic', source === 'static_reflect' ? 'Static reflection' : 'Static Shock retaliation', source, false, undefined, undefined, { abilityId: source, element: 'lightning', enemyId });
  // Triple normal damage enmity, in addition to Iron Resolve's multiplier.
  if (dealt > 0) threat(state.party[slot], dealt * .65 * 2, dealt * .8 * 2);
}

function damageActor(state: GameState, slot: number, amount: number, label: string, physical = false, attackerId: string | null = 'boss') {
  if (state.status !== 'fighting' || sequenceLocked(state)) return;
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
  const incoming = Math.round(amount * (actor.guardUntil > state.time ? 0.35 : 1) * (physical ? 1 - TRAITS[actor.role].physicalReduction : 1));
  const absorbed = Math.min(actor.hpShield, incoming);
  actor.hpShield -= absorbed;
  if (absorbed > 0) event(state, 'shield', `${actor.name}'s Rejuvenator shield absorbs ${absorbed}.`, slot, absorbed, slot, 'rejuvenator');
  const damage = Math.min(actor.hp, incoming - absorbed);
  if (damage > 0 && actor.revelryStacks > 0) {
    event(state, 'revelry_lost', `${actor.name} loses Revelry after taking damage.`, slot, actor.revelryStacks);
    actor.revelryStacks = 0;
  }
  actor.hp -= damage;
  state.runStats.party[slot].taken += damage;
  actor.ce = Math.max(0, actor.ce - damage * 0.7);
  if (damage > 0) actor.tp = Math.min(TP_MAX, actor.tp + 45);
  const groundAttacker = state.enemies.find(enemy => enemy.id === attackerId && isGroundEnemy(enemy));
  event(state, 'hit', `${actor.name}: ${label} · −${damage}`, slot, damage, undefined, undefined, undefined, undefined, undefined, groundAttacker ? { enemyId: groundAttacker.id, abilityId: groundAttacker.kind === 'storm-shard' ? 'splinterBolt' : 'groundFracture', ...(groundAttacker.kind === 'storm-shard' ? { element: 'lightning' as const } : {}) } : {});
  if (actor.hp <= 0) {
    state.runStats.party[slot].deaths++;
    clearTransient(actor);
    actor.engaged = false;
    actor.ce = actor.ve = actor.moveX = actor.moveZ = 0;
    event(state, 'down', `${actor.name} falls.`, slot);
  }
  if (damage > 0 && actor.hp > 0 && actor.id === 'heracles' && actor.staticShock > 0 && attackerId) {
    staticCounter(state, slot, attackerId, STATIC_RETALIATION_DAMAGE, 'static_retaliation');
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

  if (action.type === 'faceLogos') {
    const oldStats = state.runStats, oldTime = state.combatTime;
    const maxHp = state.mode === 'god' ? 420000 : 210000;
    state.encounter = 'logos'; state.ultimatesUnlocked = false; state.status = 'fighting'; state.logos = { stage: 'descent', elapsed: 0, readySlots: [] };
    state.combatTime = 0; state.runStats = createRunStats(state.party.length);
    state.chain = state.burst = null; state.duskRemaining = 0;
    state.boss = { name: 'Logos', x: 0, z: -12, hp: maxHp, maxHp, target: slot, phase: 1, facing: 0, attackTimer: 3, specialTimer: 10, castCount: 0, cooldowns: {}, cast: null, stunRemaining: 0, burn: null };
    state.enemies = SENTINEL_NAMES.map((name, index) => ({ id: `sentinel-${index}`, name, x: Math.sin(index * Math.PI / 3) * 18, z: Math.cos(index * Math.PI / 3) * 18, hp: 4500, maxHp: 4500, target: slot, attackTimer: 4 + index * .4, stunRemaining: 0, burn: null }));
    state.storm = createStaticStorm(state.rng);
    state.party.forEach((recipient, i) => {
      clearTransient(recipient); recipient.hp = recipient.maxHp; recipient.mp = recipient.maxMp; recipient.tp = 0;
      recipient.ce = recipient.ve = recipient.revelryStacks = recipient.recovery = recipient.spellRecovery = 0;
      recipient.cooldowns = {}; recipient.engaged = true; recipient.attackTimer = 2;
      recipient.enemyTarget = 'boss'; recipient.moveX = recipient.moveZ = 0; recipient.x = (i - 2) * 2; recipient.z = 7; recipient.aiTimer = 0;
    });
    state.runStats = oldStats; state.combatTime = oldTime;
    event(state, 'descent', 'The platform descends. Review the battle — 60 seconds to the lower arena.');
    return { ok: true };
  }

  if (action.type === 'selectEnemy') { actor.enemyTarget = action.id; return { ok: true }; }
  if (action.type === 'readyForLogos') {
    const ready = new Set(state.logos.readySlots ?? []);
    if (action.ready) ready.add(slot); else ready.delete(slot);
    state.logos.readySlots = [...ready].sort((a, b) => a - b);
    if (descentReadiness(state).allReady) beginSentinels(state);
    return { ok: true };
  }
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
  if (state.status !== 'fighting') return fail(`Engage ${state.boss.name} first.`);
  const key = cooldownKey(action);
  const definition = ABILITY_DEFINITIONS[key];

  if (isUltimate(type)) {
    actor.cooldowns[key] = definition.cooldown;
    event(state, 'ability', `${actor.name}: ${definition.name}.`, slot, undefined, undefined, type);
    if (type === 'fearless') {
      state.party.forEach(recipient => { if (recipient.hp > 0) recipient.criticalCharges = recipient.id === 'bacchus' ? 10 : 5; });
    } else if (type === 'rejuvenator') {
      state.party.forEach((recipient, target) => {
        if (recipient.hp <= 0) return;
        const healed = recipient.maxHp - recipient.hp;
        recipient.hp = recipient.maxHp; recipient.tp = TP_MAX;
        recipient.hpShield = Math.min(recipient.maxHp, recipient.hpShield + healed * .25);
        state.runStats.party[slot].healing += healed;
        threat(actor, healed * .16 * .75, healed * .4 * .75);
        if (healed > 0) event(state, 'heal', `${actor.name}: Rejuvenator restores ${recipient.name} · +${healed}`, slot, healed, target, type);
        event(state, 'ability', `${recipient.name}: full TP${healed > 0 ? ` and ${healed * .25} shield` : ''}.`, slot, healed * .25, target, type);
      });
    } else if (type === 'thunderclap') {
      actor.sonOfZeus = true;
      state.boss.target = slot;
      stunEnemies(state, 5);
      state.enemies.forEach(enemy => { if (enemy.hp > 0) enemy.target = slot; });
    } else {
      actor.spellRecovery = type === 'fission' ? 2 : 1;
      const center = offensiveTarget(state, actor);
      const targets = [...state.enemies.filter(enemy => enemy.hp > 0 && distance(enemy, center) <= 12), ...(state.logos.stage === 'sentinels' || distance(state.boss, center) > 12 ? [] : [state.boss])];
      for (const enemy of targets) {
        const enemyId = 'id' in enemy ? enemy.id : 'boss';
        const dealt = damageBoss(state, slot, type === 'fission' ? 9000 : 2000, type === 'fission' ? 'magic' : 'weapon', definition.name, type, type === 'rainOfFire', undefined, undefined, { abilityId: type, ...(type === 'rainOfFire' ? { element: 'fire' as const } : {}), ...(enemyId ? { enemyId } : {}) }, type === 'rainOfFire' ? 3 : 1.5);
        if (type === 'rainOfFire' && dealt > 0 && enemy.hp > 0 && state.status === 'fighting') enemy.burn = { source: slot, total: Math.round(dealt * .25), dealt: 0, ticks: 0, tickIn: 1 };
      }
    }
    return { ok: true };
  }
  if (type === 'lightningShock' || type === 'bolt' || type === 'clap') {
    actor.cooldowns[key] = definition.cooldown; actor.mp -= definition.mp;
    actor.spellRecovery = type === 'clap' ? 0 : 1;
    if (type === 'bolt') {
      const burst = matchesBurst(state, 'lightning');
      damageBoss(state, slot, burst ? 1500 : 600, burst ? 'burst' : 'magic', `Bolt${burst ? ' · MAGIC BURST' : ''}`, type, false, undefined, undefined, { abilityId: type, element: 'lightning' });
    } else {
      const amount = type === 'clap' ? 350 * (1 + actor.tp / TP_MAX) : 450;
      if (type === 'clap') actor.tp = 0;
      const all = [...state.enemies.filter(enemy => enemy.hp > 0), state.boss];
      let targets: typeof all;
      if (type === 'clap') targets = all.filter(enemy => distance(actor, enemy) <= 12);
      else {
        targets = [state.boss];
        const pending = all.filter(enemy => enemy !== state.boss);
        while (pending.length) {
          const last = targets.at(-1)!;
          pending.sort((a, b) => distance(a, last) - distance(b, last));
          if (distance(pending[0], last) > 8) break;
          targets.push(pending.shift()!);
        }
      }
      event(state, 'ability', `${actor.name}: ${definition.name}.`, slot, undefined, undefined, type);
      for (const enemy of targets) {
        enemy.stunRemaining = Math.max(enemy.stunRemaining, type === 'clap' ? 3 : 2);
        if (enemy === state.boss) state.boss.cast = null;
        damageBoss(state, slot, amount, 'magic', definition.name, type, false, undefined, undefined, { abilityId: type, element: 'lightning', enemyId: 'id' in enemy ? enemy.id : 'boss' });
      }
    }
    return { ok: true };
  }


  if (action.type === 'revelry') {
    if (actor.id !== 'bacchus') return fail('Only Bacchus can grant Revelry.');
    actor.cooldowns.revelry = REVELRY.cooldown;
    for (const recipient of state.party) {
      if (recipient.hp > 0) recipient.revelryStacks = Math.min(REVELRY.maxStacks, recipient.revelryStacks + 1);
    }
    grantTp(actor, 500);
    event(state, 'revelry', `${actor.name} grants one Revelry stack to every living party member.`, slot);
    return { ok: true };
  }

  if (action.type === 'weapon') {
    if (typeof action.id !== 'string' || !Object.hasOwn(WEAPONS, action.id)) return fail('Unknown weaponskill.');
    if (!actor.engaged) return fail('Engage before using a weaponskill.');
    if (distance(actor, offensiveTarget(state, actor)) > ROLES[actor.role].range) return fail('Move into weaponskill range.');
    if (actor.tp < TP_COST) return fail('A weaponskill requires 1,000 TP.');
    const spent = actor.tp;
    actor.tp = 0;
    actor.cooldowns[key] = 2;
    actor.recovery = .5;
    const def = WEAPONS[action.id];
    const damage = def.damage * (1 + (spent - TP_COST) / 4000);
    const previous = state.chain;
    const fearlessChain = actor.id === 'bacchus' && actor.criticalCharges > 0;
    const combination = previous && (previous.opener !== slot || fearlessChain || (actor.role === 'hunter' && actor.selfChainUntil > state.time)) && state.time - previous.openedAt + 1e-8 >= CHAIN_MIN_DELAY && previous.remaining > 0 ? SKILLCHAINS[`${previous.weapon}:${action.id}`] : undefined;
    damageBoss(state, slot, damage, 'weapon', def.name, undefined, false, undefined, undefined, { abilityId: key, weaponId: action.id, ...(actor.role === 'vanguard' || actor.role === 'hunter' ? { element: WEAPON_ELEMENTS[action.id] } : {}) });
    if (state.status !== 'fighting') return { ok: true };
    if (combination) {
      if (previous?.opener === slot) actor.selfChainUntil = 0;
      damageBoss(state, slot, damage * 0.9, 'chain', `${combination.property} skillchain`, undefined, false, undefined, undefined, { abilityId: 'chain', weaponId: action.id, element: combination.element });
      if (state.status === 'fighting') state.burst = { element: combination.element, remaining: BURST_WINDOW };
      if (state.status === 'fighting' && fearlessChain && previous?.opener === slot) {
        state.duskRemaining = DUSK_WINDOW;
        event(state, 'dusk', 'Dusk marked — every element can Magic Burst for 10 seconds.', slot);
      }
    }
    if (state.status === 'fighting') state.chain = { property: combination?.property ?? def.property, opener: slot, weapon: action.id, remaining: CHAIN_WINDOW, openedAt: state.time };
    return { ok: true };
  }
  if (action.type === 'elementalShot') {
    actor.mp -= definition.mp;
    actor.cooldowns[key] = definition.cooldown;
    actor.spellRecovery = 1;
    const element = actor.shotElement;
    const burst = matchesBurst(state, element);
    const name = element === 'fire' ? 'Fire Shot' : element === 'ice' ? 'Ice Shot' : 'Lightning Shot';
    damageBoss(state, slot, burst ? 780 : 230, burst ? 'burst' : 'magic', `${name}${burst ? ' · MAGIC BURST' : ''}`, 'elementalShot', false, undefined, undefined, { abilityId: 'elementalShot', element });
    return { ok: true };
  }
  if (action.type === 'magic') {
    if (typeof action.element !== 'string' || !Object.hasOwn(MAGIC, action.element)) return fail('Unknown magic element.');
    if (distance(actor, offensiveTarget(state, actor)) > MAGIC_RANGE) return fail('Move into magic range.');
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
    const burst = matchesBurst(state, action.element);
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
    if (distance(actor, offensiveTarget(state, actor)) > MAGIC_RANGE) return fail('Move into provoke range.');
    actor.cooldowns.provoke = 18;
    threat(actor, 300, 2800);
    event(state, 'provoke', `${actor.name} provokes ${state.boss.name}.`, slot);
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

function stunEnemies(state: GameState, seconds: number) {
  state.boss.stunRemaining = Math.max(state.boss.stunRemaining, seconds);
  state.boss.cast = null;
  for (const enemy of state.enemies) if (enemy.hp > 0) enemy.stunRemaining = Math.max(enemy.stunRemaining, seconds);
}

function forcedTarget(state: GameState): number {
  return state.party.findIndex(actor => actor.hp > 0 && actor.sonOfZeus);
}

/** Burn is a fixed budget of actual impact damage, never re-scaled or re-critted. */
function burnStep(state: GameState, enemy: EnemyStatus & { hp: number; name: string }, dt: number, enemyId?: string) {
  const burn = enemy.burn;
  if (!burn || enemy.hp <= 0) { enemy.burn = null; return; }
  burn.tickIn -= dt;
  if (burn.tickIn > 1e-8) return;
  burn.ticks++;
  const budget = Math.round(burn.total * burn.ticks / 3) - burn.dealt;
  burn.dealt += budget; burn.tickIn += 1;
  const damage = Math.min(enemy.hp, budget);
  enemy.hp -= damage;
  state.runStats.party[burn.source].damage += damage;
  if (state.party[burn.source].hp > 0) threat(state.party[burn.source], damage * .65, damage * .8);
  event(state, 'magic', `${enemy.name}: Rain of Fire burn · ${damage}`, burn.source, damage, undefined, 'rainOfFireBurn', false, undefined, undefined, { abilityId: 'rainOfFireBurn', element: 'fire', ...(enemyId ? { enemyId } : {}) });
  if (burn.ticks >= 3 || enemy.hp <= 0) enemy.burn = null;
  finishIfNeeded(state);
}

function enemiesStep(state: GameState, dt: number) {
  if (sentinelEntryActive(state)) return;
  for (const enemy of state.enemies) {
    if (state.status !== 'fighting') return;
    burnStep(state, enemy, dt, enemy.id);
    if (enemy.hp <= 0) {
      if (enemy.id.endsWith('-hand') && state.logos.stage === 'giant') { enemy.attackTimer -= dt; if (enemy.attackTimer <= 0) { enemy.hp = enemy.maxHp; enemy.attackTimer = 4; event(state, 'hand_reformed', `${enemy.name} reforms.`); } }
      continue;
    }
    if ((enemy.emergeRemaining ?? 0) > 0) {
      enemy.emergeRemaining = Math.max(0, enemy.emergeRemaining! - dt);
      if (enemy.emergeRemaining <= 1e-8) {
        enemy.emergeRemaining = 0;
        event(state, 'ground_awaken', `${enemy.name} rises from the lightning-struck ground.`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { abilityId: 'groundAwakening', enemyId: enemy.id, element: 'lightning', area: { kind: 'circle', x: enemy.spawnX ?? enemy.x, z: enemy.spawnZ ?? enemy.z, radius: 2.2, total: GROUND_EMERGE_SECONDS, angle: 0 } });
      }
      continue;
    }
    const forced = forcedTarget(state);
    const threatTarget = state.party.map((a,i)=>({a,i})).filter(x=>x.a.hp>0).sort(compareThreat)[0]?.i ?? -1;
    enemy.target = forced >= 0 ? forced : threatTarget;
    if (enemy.stunRemaining > 0) { enemy.stunRemaining = Math.max(0, enemy.stunRemaining - dt); if (enemy.stunRemaining <= 1e-8) enemy.stunRemaining = 0; continue; }
    const target = state.party[enemy.target];
    if (!target || target.hp <= 0) continue;
    const range = distance(enemy, target);
    const ground = enemy.kind ? GROUND_BALANCE[enemy.kind] : undefined;
    const thrower = enemy.kind === 'storm-shard' || enemy.id.startsWith('sentinel-') && Number(enemy.id.at(-1)) % 3 === 2;
    const reach = ground?.reach ?? (thrower ? 12 : 3);
    const speed = ground?.speed ?? (enemy.id.endsWith('-hand') ? 3.2 : 3.8);
    if (range > reach) { enemy.x += (target.x - enemy.x) / range * speed * dt; enemy.z += (target.z - enemy.z) / range * speed * dt; }
    enemy.attackTimer -= dt;
    if (enemy.attackTimer <= 1e-8 && range <= reach + .5) {
      const hand = enemy.id.endsWith('-hand');
      const leaper = enemy.id.startsWith('sentinel-') && Number(enemy.id.at(-1)) % 3 === 1;
      const damage = ground ? ground.damage * (state.mode === 'god' ? 1.2 : 1) : hand ? 220 : leaper ? 110 : 85;
      damageActor(state, enemy.target, damage, enemy.kind === 'ground-shard' ? 'Ground fracture' : enemy.kind === 'storm-shard' ? 'Splinter bolt' : hand ? 'Titan palm' : leaper ? 'Sentinel leap' : thrower ? 'Ranged throw' : 'Melee charge', !thrower, enemy.id); enemy.attackTimer = ground?.interval ?? (hand ? 4 : leaper ? 5 : 3.5);
      finishIfNeeded(state);
    }
  }
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
    const dx = sequence.originX - offensiveTarget(state, actor).x, dz = sequence.originZ - offensiveTarget(state, actor).z;
    const length = Math.hypot(dx, dz) || 1;
    const endX = offensiveTarget(state, actor).x + dx / length * 1.2, endZ = offensiveTarget(state, actor).z + dz / length * 1.2;
    actor.x = sequence.originX + (endX - sequence.originX) * fraction;
    actor.z = sequence.originZ + (endZ - sequence.originZ) * fraction;
    bounds(actor);
  }
  while (sequence.nextHit < times.length && sequence.elapsed + 1e-8 >= times[sequence.nextHit]) {
    const hitIndex = sequence.nextHit++;
    if (!dash && distance(actor, offensiveTarget(state, actor)) > ROLES.hunter.range) continue;
    const dealt = damageBoss(state, slot, dash ? ROLES.vanguard.damage : ROLES.hunter.damage * .4, 'weapon', dash ? 'Critical Dash' : 'Split Volley', sequence.kind, dash, sequence.id, hitIndex, { element: dash ? 'fire' : actor.shotElement });
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
  if (state.encounter === 'crown') {
    // Tank/healer anchor the boss while damage trusts focus a shared living add.
    // An explicit human target is never overwritten by this AI-only path.
    const adds = state.enemies.filter(enemy => isGroundEnemy(enemy) && enemy.hp > 0 && (enemy.emergeRemaining ?? 0) <= 0);
    const preferred = adds.find(enemy => enemy.kind === 'storm-shard') ?? adds[0];
    actor.enemyTarget = actor.role === 'warden' || actor.role === 'luminary' ? 'boss' : preferred?.id ?? 'boss';
  }
  if (state.ultimatesUnlocked && state.combatTime > 8 + slot * 1.25) {
    const use = actor.role !== 'luminary' || state.party.some(p => p.hp > 0 && p.hp < p.maxHp * .6);
    if (use && applyAction(state, slot, { type: ULTIMATES[actor.role] }).ok) return;
  }
  if (actor.id === 'bacchus') applyAction(state, slot, { type: 'revelry' });
  const cast = state.boss.cast;
  const enemy = offensiveTarget(state, actor);
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
  if (distance(actor, enemy) > desiredRange + 1 || distance(actor, enemy) < desiredRange - 1.5) {
    moveToward(actor, enemy.x + Math.sin(formationAngle) * desiredRange, enemy.z + Math.cos(formationAngle) * desiredRange, 0.3);
  }
  if (actor.role === 'luminary') {
    if (state.party.some(p => p.hp > 0 && p.maxHp - p.hp > 360)) applyAction(state, slot, { type: 'heal' });
  }
  if (actor.role === 'warden') {
    applyAction(state, slot, { type: 'provoke' });
    if (actor.hp < actor.maxHp * 0.72) applyAction(state, slot, { type: 'guard' });
    if (actor.sonOfZeus) {
      if (actor.tp >= TP_COST && state.boss.stunRemaining < .1) applyAction(state, slot, { type: 'clap' });
      if (state.boss.stunRemaining < .1) applyAction(state, slot, { type: 'lightningShock' });
      applyAction(state, slot, { type: 'bolt' });
    }
  }
  if (actor.role === 'arcanist') {
    if (actor.mp >= 420 && (state.burst || state.boss.phase >= 2)) applyAction(state, slot, { type: 'rapidWeave' });
    const cycle = actor.elementalCycle.elements;
    const ordered = [...ELEMENTS.filter(e => !cycle.includes(e)), ...cycle];
    if (state.burst) ordered.unshift(state.burst.element);
    for (const element of ordered) if (applyAction(state, slot, { type: 'magic', element }).ok) break;
  }
  if (canUseActionRole(actor.role, 'weapon') && actor.tp >= TP_COST && distance(actor, offensiveTarget(state, actor)) <= ROLES[actor.role].range) {
    const chain = state.chain;
    if (chain && (chain.opener !== slot || actor.selfChainUntil > state.time || actor.id === 'bacchus' && actor.criticalCharges > 0) && state.time - chain.openedAt >= CHAIN_MIN_DELAY + 0.3) {
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
  if (state.logos.stage === 'sentinels') return;
  for (const key of Object.keys(boss.cooldowns)) boss.cooldowns[key] = Math.max(0, boss.cooldowns[key] - dt);
  const fightClock = state.logos.stage === 'giant' ? state.logos.elapsed : state.combatTime;
  const forced = forcedTarget(state);
  if (forced >= 0) boss.target = forced;
  if (boss.stunRemaining > 0) { boss.stunRemaining = Math.max(0, boss.stunRemaining - dt); if (boss.stunRemaining <= 1e-8) boss.stunRemaining = 0; return; }
  if (state.mode === 'god' && fightClock >= GOD_ENRAGE_TIME - GOD_ENRAGE_CAST) {
    const remaining = Math.max(0, GOD_ENRAGE_TIME - fightClock);
    if (remaining > 0) {
      if (boss.cast?.name !== 'Coherence Collapse') event(state, 'cast', `Coherence Collapse — 10 seconds remain. Defeat ${boss.name}; this collapse cannot be guarded or evaded.`, undefined, undefined, undefined, 'collapse');
      boss.cast = { abilityId: 'collapse', name: 'Coherence Collapse', kind: 'raid', x: boss.x, z: boss.z, radius: 100, angle: boss.facing, total: GOD_ENRAGE_CAST, remaining };
    } else {
      event(state, 'enrage', `Coherence Collapse. ${boss.name} outlasts the party; the local arena gives way.`, undefined, undefined, undefined, 'collapse');
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
  candidates.sort(compareThreat);
  boss.target = forced >= 0 ? forced : candidates[0]?.i ?? -1;
  const phase = boss.hp / boss.maxHp <= 0.33 ? 3 : boss.hp / boss.maxHp <= 0.67 ? 2 : 1;
  if (phase !== boss.phase) {
    boss.phase = phase;
    boss.specialTimer = Math.min(boss.specialTimer, 3);
    event(state, 'phase', `${boss.name} phase ${phase}: ${state.logos.stage === 'giant' ? phase === 2 ? 'Axiom Unbound' : 'Coherence Shear' : phase === 2 ? 'Fractured Crown' : 'Terminal Eclipse'}.`);
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
      if (state.status !== 'fighting' || sequenceLocked(state)) return;
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
  if (state.logos.stage !== 'giant' && distance(boss, target) > 3.7) {
    const length = distance(boss, target);
    boss.x += (target.x - boss.x) / length * 2.3 * dt;
    boss.z += (target.z - boss.z) / length * 2.3 * dt;
  }
  boss.attackTimer -= dt;
  boss.specialTimer -= dt;
  if (state.logos.stage !== 'giant' && boss.attackTimer <= 0 && distance(boss, target) <= 4.3) {
    damageActor(state, boss.target, (state.encounter === 'crown' ? 155 : 180) * 1.05 * (1 + (boss.phase - 1) * 0.15), 'Crown strike', true);
    boss.attackTimer = 2.7 - boss.phase * 0.15;
    finishIfNeeded(state);
  }
  if (state.status !== 'fighting' || boss.specialTimer > 0) return;
  const abilities = state.logos.stage === 'giant' ? [
    { id: 'logosRay', name: 'Axiom Ray', kind: 'cone' as const, total: 3.5, radius: 22, cooldown: 16 },
    { id: 'logosShudder', name: 'Realm Shudder', kind: 'raid' as const, total: 4, radius: 100, cooldown: 25 },
    { id: 'logosFracture', name: 'Coherence Fracture', kind: 'circle' as const, total: 3, radius: 6, cooldown: 20 },
  ] : [
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
    boss.specialTimer = (state.encounter === 'crown' ? 14 : 12) - boss.phase;
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
      const heracles = state.party.findIndex(actor => actor.id === 'heracles' && actor.hp > 0);
      if (storm.target === 'heracles') {
        if (heracles >= 0) {
          state.party[heracles].staticShock = STATIC_SHOCK_SECONDS;
          event(state, 'static_charge', 'Heracles gains Static Shock: attackers take reflected lightning for 20 seconds.', heracles, STATIC_SHOCK_SECONDS, undefined, 'staticStorm', undefined, undefined, undefined, { element: 'lightning' });
        }
        return;
      }
      if (storm.target === 'arena') {
        event(state, 'static_discharge', 'Lightning grounds through the arena.', undefined, undefined, undefined, 'staticStorm');
        return;
      }
      if (heracles >= 0) staticCounter(state, heracles, storm.enemyId, STATIC_REFLECT_DAMAGE, 'static_reflect');
      if (state.status !== 'fighting') return;
      const origin = storm.enemyId === 'boss' ? state.boss : state.enemies.find(enemy => enemy.id === storm.enemyId);
      const targets = origin && origin.hp > 0 ? staticArcTargets({ boss: { ...state.boss, x: origin.x, z: origin.z }, party: state.party }) : [];
      event(state, 'static_discharge', targets.length ? 'Static discharge — spread out!' : 'Static discharge grounds harmlessly.', undefined, undefined, undefined, 'staticStorm');
      targets.forEach((target, jump) => {
        event(state, 'static_arc', `Static arcs to ${state.party[target].name}.`, target, undefined, jump > 0 ? targets[jump - 1] : undefined, 'staticStorm');
        damageActor(state, target, 420 * Math.pow(.75, jump), 'Static arc', false, null);
      });
      finishIfNeeded(state);
      if (state.status !== 'fighting') return;
    }
  }
  if (storm.remaining <= 1e-8) {
    selectStaticStrike(state);
    storm.charge = STATIC_CHARGE_SECONDS;
    storm.remaining = nextStaticInterval(storm);
    const heracles = state.party.findIndex(actor => actor.id === 'heracles' && actor.hp > 0);
    const label = storm.target === 'heracles' ? 'Lightning charges Heracles — Static Shock is gathering!' : storm.target === 'arena' ? 'Lightning strikes the arena.' : 'Lightning charges the enemy — Heracles will reflect it!';
    event(state, 'static_strike', label, storm.target === 'heracles' && heracles >= 0 ? heracles : undefined, undefined, undefined, 'staticStorm', undefined, undefined, undefined, { element: 'lightning', ...(storm.target === 'boss' ? { enemyId: storm.enemyId } : {}), area: { kind: 'circle', x: storm.x, z: storm.z, radius: 2.5, angle: 0, total: STATIC_CHARGE_SECONDS } });
  }
}

function fixedStep(state: GameState) {
  const dt = FIXED_STEP;
  state.time = ++state.tick * dt;
  if (state.status === 'fighting' && !sequenceLocked(state)) {
    const previous = state.combatTime;
    state.combatTime = Math.round((state.combatTime + dt) / dt) * dt;
    if (state.mode === 'god' && previous < GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING && state.combatTime >= GOD_ENRAGE_TIME - GOD_ENRAGE_WARNING) event(state, 'warning', `Coherence Collapse approaches — 30 seconds remain. Finish ${state.boss.name}.`);
  }
  if (state.chain) {
    state.chain.remaining = Math.max(0, CHAIN_WINDOW - (state.time - state.chain.openedAt));
    if (state.chain.remaining <= 1e-8) state.chain = null;
  }
  if (state.burst) {
    state.burst.remaining = Math.max(0, state.burst.remaining - dt);
    if (state.burst.remaining <= 1e-8) state.burst = null;
  }
  state.duskRemaining = Math.max(0, state.duskRemaining - dt);
  if (state.duskRemaining <= 1e-8) state.duskRemaining = 0;
  for (let i = 0; i < state.party.length; i++) {
    const actor = state.party[i];
    for (const key of Object.keys(actor.cooldowns)) actor.cooldowns[key] = Math.max(0, actor.cooldowns[key] - dt);
    actor.recovery = Math.max(0, actor.recovery - dt);
    actor.spellRecovery = Math.max(0, actor.spellRecovery - dt);
    actor.staticShock = Math.max(0, actor.staticShock - dt);
    if (actor.hp <= 0) { clearTransient(actor); continue; }
    if (sequenceLocked(state)) { actor.moveX = actor.moveZ = 0; continue; }
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
    if (actor.engaged && actor.attackTimer <= 1e-8 && distance(actor, offensiveTarget(state, actor)) <= ROLES[actor.role].range) {
      const role = ROLES[actor.role];
      const dealt = damageBoss(state, i, role.damage, 'auto', 'auto attack');
      if (dealt > 0) grantTp(actor, role.tp);
      if (state.status === 'fighting' && TRAITS[actor.role].extraHitChance > 0 && random(state) < TRAITS[actor.role].extraHitChance) {
        if (damageBoss(state, i, role.damage * .5, 'auto', 'extra attack', 'extraHit') > 0) grantTp(actor, role.tp * .5);
      }
      actor.attackTimer = ROLES[actor.role].delay;
    }
  }
  if (state.status === 'fighting' && sequenceLocked(state)) {
    state.logos.elapsed += dt;
    if (state.logos.stage === 'descent' && (state.logos.elapsed + 1e-8 >= DESCENT_SECONDS || descentReadiness(state).allReady)) beginSentinels(state);
    else if (state.logos.stage === 'collapse' && state.logos.elapsed + 1e-8 >= COLLAPSE_SECONDS) { state.logos = { stage: 'escaped', elapsed: COLLAPSE_SECONDS }; finishIfNeeded(state); }
    return;
  }
  if (state.status === 'fighting' && state.logos.stage !== 'none') {
    const entering = sentinelEntryActive(state);
    state.logos.elapsed += dt;
    if (entering && !sentinelEntryActive(state)) event(state, 'lair_answer', 'Logos!');
  }
  if (state.status === 'fighting') burnStep(state, state.boss, dt);
  if (state.status === 'fighting') {
    const wave = nextGroundWave(state);
    state.enemies.push(...wave);
    for (const enemy of wave) event(state, 'ground_charge', 'Lightning gathers. Something stirs beneath the stone.', undefined, undefined, undefined, undefined, undefined, undefined, undefined, { abilityId: 'groundAwakening', enemyId: enemy.id, element: 'lightning', area: { kind: 'circle', x: enemy.x, z: enemy.z, radius: 2.2, total: GROUND_EMERGE_SECONDS, angle: 0 } });
  }
  if (state.status === 'fighting') enemiesStep(state, dt);
  if (state.status === 'fighting') stormStep(state, dt);
  if (state.status === 'fighting') bossStep(state, dt);
  if (state.status === 'fighting') finishIfNeeded(state);
}

/** Bounded deterministic catch-up: callers submit elapsed seconds, never wall-clock state. */
export function stepGame(state: GameState, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0 || dtSeconds > 30 || state.status === 'victory' || state.status === 'defeat') return;
  state.remainder += dtSeconds;
  let steps = Math.floor((state.remainder + 1e-9) / FIXED_STEP);
  state.remainder = Math.max(0, state.remainder - steps * FIXED_STEP);
  while (steps-- > 0 && (state.status === 'ready' || state.status === 'fighting')) fixedStep(state);
}
