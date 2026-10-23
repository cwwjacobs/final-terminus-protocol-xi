import { canUseActionRole, TP_COST } from '../../game/content.ts';
import type { Actor, GameState } from '../../game/types.ts';

export type CombatEvent = GameState['events'][number];
export type FeedbackTarget = 'boss' | number;
export interface CombatNumber {
  id: number;
  target: FeedbackTarget;
  text: string;
  tone: 'damage' | 'hurt' | 'heal' | 'chain' | 'burst';
}

/** Existing logs are a baseline, not an animation request. Epoch is local UI
 * identity, independent of combat/network state; it also handles equal clocks. */
export class PresentationEvents {
  private sequence: number;
  private time: number;
  private epoch: number;

  constructor(state: GameState, epoch = 0) {
    this.sequence = state.eventSeq; this.time = state.time; this.epoch = epoch;
  }

  read(state: GameState, epoch = 0): { reset: boolean; events: CombatEvent[] } {
    const incoming = state.events.filter(event => event.id > this.sequence);
    const reset = epoch !== this.epoch || state.time < this.time || state.eventSeq < this.sequence ||
      (incoming.length > 0 && incoming[0].id > this.sequence + 1);
    this.sequence = state.eventSeq; this.time = state.time; this.epoch = epoch;
    // A long suspension/network gap must not burst an old log onto the screen.
    return { reset, events: reset ? [] : incoming.filter(event =>
      state.combatTime - event.time <= 1 && event.time <= state.combatTime + .05) };
  }
}

/** Use structured event semantics only. Legacy heal events cannot identify the
 * recipient and intentionally produce no number rather than credit the caster. */
export function combatNumber(event: CombatEvent, state: GameState): CombatNumber | null {
  if (typeof event.value !== 'number' || !Number.isFinite(event.value) || event.value <= 0) return null;
  const amount = event.value > 999_999 ? '999,999+' : Math.round(event.value).toLocaleString('en-US');
  if (['auto', 'weapon', 'magic', 'chain', 'burst'].includes(event.kind)) {
    const tone = event.kind === 'burst' ? 'burst' : event.kind === 'chain' ? 'chain' : 'damage';
    return { id: event.id, target: 'boss', text: `${tone === 'burst' ? 'BURST ' : tone === 'chain' ? 'CHAIN ' : ''}${amount}`, tone };
  }
  const target = event.kind === 'heal' ? event.target : event.kind === 'hit' ? event.actor : undefined;
  if (typeof target !== 'number' || !Number.isInteger(target) || !state.party[target]) return null;
  return { id: event.id, target, text: `${event.kind === 'heal' ? '+' : '−'}${amount}`, tone: event.kind === 'heal' ? 'heal' : 'hurt' };
}

export function partyFeedback(actor: Pick<Actor, 'role' | 'hp' | 'maxHp' | 'tp'>) {
  const alive = actor.hp > 0;
  const eligible = canUseActionRole(actor.role, 'weapon');
  return {
    alive,
    lowHp: alive && actor.maxHp > 0 && actor.hp / actor.maxHp <= .25,
    tpReady: alive && eligible && actor.tp >= TP_COST,
    tpFraction: alive && eligible ? Math.max(0, Math.min(1, actor.tp / TP_COST)) : 0,
  };
}

export interface NumberSlot {
  feedback: CombatNumber | null;
  x: number; y: number; z: number;
  age: number;
  lane: number;
}

/** Fixed slots, oldest-first eviction, copied coordinates, no gameplay writes. */
export class CombatNumberPool {
  readonly slots: NumberSlot[];
  readonly duration = 1.3;

  constructor(capacity: number) {
    const count = Math.max(1, Math.min(32, Number.isFinite(capacity) ? Math.floor(capacity) : 1));
    this.slots = Array.from({ length: count }, () => ({ feedback: null, x: 0, y: 0, z: 0, age: 0, lane: 0 }));
  }

  spawn(feedback: CombatNumber, position: { x: number; y: number; z: number }): void {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    let slot = this.slots.find(item => !item.feedback);
    if (!slot) slot = this.slots.reduce((oldest, item) => item.age > oldest.age ? item : oldest);
    const occupied = new Set(this.slots.filter(item => item.feedback?.target === feedback.target && item !== slot).map(item => item.lane));
    let lane = 0; while (occupied.has(lane)) lane++;
    Object.assign(slot, { feedback, x: position.x, y: position.y, z: position.z, age: 0, lane });
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const slot of this.slots) if (slot.feedback) {
      slot.age += dt;
      if (slot.age >= this.duration) slot.feedback = null;
    }
  }

  reset(): void { for (const slot of this.slots) slot.feedback = null; }
}
