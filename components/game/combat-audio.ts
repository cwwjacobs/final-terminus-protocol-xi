import type { BossCast } from '../../game/types.ts';
import type { CombatEvent } from './world-feedback.ts';
import { presentationContact, presentationElement, presentationKey } from './presentation-cues.ts';

export type CombatSound =
  | 'thunder' | 'arc' | 'wave' | 'thread' | 'swipe' | 'impact' | 'pierce' | 'resonance'
  | 'bowDraw' | 'bow' | 'fireCharge' | 'fire' | 'iceCharge' | 'ice' | 'lightningCharge' | 'lightning'
  | 'chain' | 'burst' | 'heal' | 'shield' | 'shieldBreak' | 'revelry' | 'provoke' | 'weave'
  | 'guard' | 'dodge' | 'hit' | 'down' | 'bossCharge' | 'bossImpact';
export interface CombatSoundCue { sound: CombatSound; delay: number; gain: number; priority: 0 | 1 | 2 | 3 }
export const COMBAT_AUDIO_LIMITS = Object.freeze({ pending: 48, voices: 18, perTick: 6, staleAfter: .25 });

/** One primary sound per event. Recipient fan-out and recurring healing ticks
 * do not replay a group spell's cast. This also preserves the original cues. */
export function combatSound(event: CombatEvent): CombatSound | null {
  if (event.source === 'rainOfFireBurn') return null;
  if (['fission', 'rainOfFire', 'fearless', 'rejuvenator', 'thunderclap', 'lightningShock', 'clap'].includes(event.source ?? '')) {
    if (event.kind !== 'ability' || event.target !== undefined) return null;
    return event.source === 'fission' || event.source === 'thunderclap' || event.source === 'clap' ? 'thunder' : event.source === 'rainOfFire' ? 'fire' : event.source === 'fearless' ? 'revelry' : event.source === 'lightningShock' ? 'arc' : 'wave';
  }
  if (event.source === 'bolt' && (event.kind === 'magic' || event.kind === 'burst')) return 'lightning';
  const key = presentationKey(event);
  if (key === 'mendingThread') return event.kind === 'ability' ? 'thread' : null;
  if (key === 'shimmerWave') return event.kind === 'shimmer_wave' ? 'wave' : null;
  if (key === 'criticalDash') return event.kind === 'ability' ? 'dodge' : event.kind === 'weapon' ? 'impact' : null;
  if (key === 'splitVolley') return event.kind === 'ability' ? 'bowDraw' : event.kind === 'weapon' ? 'bow' : null;
  if (key === 'elementalShot') return presentationElement(event) ?? 'bow';
  switch (key) {
    case 'staticStrike': return 'thunder';
    case 'staticDischarge': return 'arc';
    case 'auto': case 'cleave': return 'impact';
    case 'pierce': case 'resonance': case 'fire': case 'ice': case 'lightning':
    case 'chain': case 'heal': case 'revelry': case 'provoke': case 'guard': case 'dodge': case 'hit': case 'down': return key;
    case 'aegis': return event.kind === 'ability' ? 'shield' : null;
    case 'shieldBreak': return 'shieldBreak';
    case 'rapidWeave': return 'weave';
    case 'bossCast': return 'bossCharge';
    case 'bossImpact': return 'bossImpact';
    default: return null;
  }
}

/** Shared contact times keep weapon/spell sound on the same presentation
 * moment as the motion and VFX. Combat resolution itself is never delayed. */
export function combatSoundPlan(event: CombatEvent, actorId?: string): CombatSoundCue[] {
  const sound = combatSound(event);
  if (!sound) return [];
  const key = presentationKey(event), contact = presentationContact(event, actorId);
  const cue = (sound: CombatSound, delay: number, gain: number, priority: CombatSoundCue['priority'] = 2): CombatSoundCue => ({ sound, delay, gain, priority });
  if (key === 'auto') {
    const ranged = actorId === 'dolos';
    return [cue(ranged ? 'bow' : 'swipe', 0, .16, 0), cue('impact', contact, .12, 0)];
  }
  if (key === 'cleave' || key === 'pierce' || key === 'resonance') {
    return [cue(actorId === 'dolos' ? 'bowDraw' : 'swipe', 0, .65), cue(sound, contact, .75)];
  }
  if (key === 'elementalShot') return [cue('bow', 0, .5), cue(sound, contact, .65), ...(event.kind === 'burst' ? [cue('burst', contact + .04, .5, 3)] : [])];
  if (key === 'fire' || key === 'ice' || key === 'lightning') {
    return [cue(`${key}Charge`, 0, .4, 1), cue(key, contact, .7), ...(event.kind === 'burst' ? [cue('burst', contact + .04, .6, 3)] : [])];
  }
  if (key === 'hit') return [cue(sound, 0, .28, 1)];
  if (key === 'bossCast' || key === 'bossImpact' || key === 'staticStrike' || key === 'staticDischarge' || key === 'down') return [cue(sound, 0, .75, 3)];
  return [cue(sound, 0, key === 'splitVolley' ? .4 : .6)];
}

interface PendingSound extends CombatSoundCue { due: number; actor?: number; eventId: number }
/** A bounded presentation-clock queue. No timer callbacks can outlive a pause,
 * reset, hidden tab or scene. Silent expired contacts never burst on resume. */
export class CombatAudioQueue {
  private pending: PendingSound[] = [];
  private seen = new Set<number>();
  private played = new Map<CombatSound, number>();
  get size() { return this.pending.length; }
  enqueue(event: CombatEvent, now: number, actorId?: string) {
    if (!Number.isFinite(now) || this.seen.has(event.id)) return;
    this.seen.add(event.id);
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    for (const cue of combatSoundPlan(event, actorId)) {
      this.pending.push({ ...cue, due: now + cue.delay, actor: event.actor, eventId: event.id });
      if (this.pending.length > COMBAT_AUDIO_LIMITS.pending) {
        let victim = 0;
        for (let i = 1; i < this.pending.length; i++) if (this.pending[i].priority < this.pending[victim].priority) victim = i;
        this.pending.splice(victim, 1);
      }
    }
  }
  drain(now: number, living: readonly boolean[]): PendingSound[] {
    if (!Number.isFinite(now) || this.pending.length === 0) return [];
    const due = this.pending.filter(c => c.due <= now + 1e-7);
    this.pending = this.pending.filter(c => c.due > now + 1e-7);
    due.sort((a, b) => b.priority - a.priority || a.due - b.due || a.eventId - b.eventId);
    const out: PendingSound[] = [];
    for (const cue of due) {
      if (now - cue.due > COMBAT_AUDIO_LIMITS.staleAfter || (cue.delay > 0 && typeof cue.actor === 'number' && !living[cue.actor])) continue;
      // Group Aegis recipients and simultaneous auto attacks do not multiply
      // volume. Actual signature contacts still retain their separate beats.
      const interval = cue.priority === 0 ? .14 : cue.sound === 'shield' ? .18 : cue.priority === 1 ? .09 : .035;
      if (now - (this.played.get(cue.sound) ?? -Infinity) < interval - 1e-7) continue;
      if (out.length >= COMBAT_AUDIO_LIMITS.perTick) break;
      this.played.set(cue.sound, now); out.push(cue);
    }
    return out;
  }
  reset() { this.pending = []; this.seen.clear(); this.played.clear(); }
}

type Tone = readonly [OscillatorType, number, number, number, number];
type Noise = readonly [BiquadFilterType, number, number, number, number];
interface Recipe { tones?: readonly Tone[]; noise?: Noise }
/** Original synthesized timbres. Levels are intentionally modest before the
 * user's 35% effects master; the reusable noise buffer is created only once. */
const RECIPES: Record<CombatSound, Recipe> = {
  thunder: { noise: ['lowpass', 240, 90, 1.8, .24], tones: [['sine', 48, 30, .8, .1]] },
  arc: { noise: ['bandpass', 1800, 550, .28, .16], tones: [['triangle', 160, 55, .2, .04]] },
  wave: { tones: [['sine', 523, 1046, .7, .09], ['sine', 784, 1568, .8, .035]] },
  thread: { tones: [['sine', 784, 1175, .55, .08], ['sine', 1175, 1568, .7, .025]] },
  swipe: { noise: ['bandpass', 500, 2100, .18, .07] },
  impact: { noise: ['lowpass', 1100, 180, .14, .09], tones: [['sine', 100, 45, .15, .07]] },
  pierce: { noise: ['bandpass', 2300, 650, .18, .08], tones: [['triangle', 240, 65, .2, .035]] },
  resonance: { tones: [['sine', 280, 90, .45, .1], ['sine', 560, 180, .5, .045]] },
  bowDraw: { noise: ['bandpass', 450, 1600, .2, .05] },
  bow: { tones: [['triangle', 850, 220, .16, .055]], noise: ['bandpass', 2400, 800, .09, .04] },
  fireCharge: { noise: ['bandpass', 600, 2000, .25, .06], tones: [['sine', 110, 220, .24, .025]] },
  fire: { noise: ['lowpass', 1800, 200, .55, .14], tones: [['sine', 85, 38, .32, .07]] },
  iceCharge: { tones: [['sine', 660, 1200, .25, .045], ['sine', 1320, 1800, .22, .02]] },
  ice: { tones: [['sine', 1900, 900, .23, .055], ['sine', 2700, 1400, .3, .025]], noise: ['highpass', 3000, 1300, .18, .045] },
  lightningCharge: { tones: [['sawtooth', 900, 1400, .23, .018]] },
  lightning: { noise: ['highpass', 2100, 600, .2, .12], tones: [['sine', 140, 70, .24, .06]] },
  chain: { tones: [['triangle', 440, 660, .36, .055], ['sine', 880, 1320, .42, .04]] },
  burst: { noise: ['lowpass', 2300, 200, .45, .12], tones: [['triangle', 220, 80, .5, .04]] },
  heal: { tones: [['sine', 660, 880, .6, .065], ['sine', 990, 1320, .6, .025]] },
  shield: { tones: [['sine', 320, 480, .35, .075], ['sine', 640, 960, .45, .03]] },
  shieldBreak: { noise: ['highpass', 3000, 600, .26, .06], tones: [['sine', 1400, 350, .24, .055]] },
  revelry: { tones: [['triangle', 294, 392, .4, .045], ['sine', 440, 587, .5, .04]] },
  provoke: { noise: ['bandpass', 330, 160, .32, .08], tones: [['triangle', 100, 65, .4, .06]] },
  weave: { tones: [['sine', 440, 1760, .45, .045], ['sine', 660, 1320, .55, .025]] },
  guard: { tones: [['triangle', 180, 120, .25, .05]], noise: ['bandpass', 900, 350, .12, .04] },
  dodge: { noise: ['bandpass', 1700, 400, .21, .06] },
  hit: { noise: ['lowpass', 700, 220, .12, .07] },
  down: { tones: [['sine', 220, 55, .55, .06]] },
  bossCharge: { tones: [['sine', 75, 170, .4, .035]] },
  bossImpact: { noise: ['lowpass', 1800, 100, .6, .14], tones: [['sine', 80, 28, .7, .08]] },
};

export function createCombatAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null, volume = .35;
  let charge: { source: OscillatorNode; gain: GainNode; id: string } | null = null;
  const voices = new Map<AudioScheduledSourceNode, { nodes: AudioNode[]; priority: number }>();
  function release(source: AudioScheduledSourceNode) {
    const owned = voices.get(source); if (!owned) return;
    voices.delete(source); source.onended = null;
    try { source.stop(); } catch {}
    source.disconnect(); owned.nodes.forEach(node => node.disconnect());
    if (charge?.source === source) charge = null;
  }
  function track(source: AudioScheduledSourceNode, nodes: AudioNode[], duration: number, priority: number): boolean {
    if (voices.size >= COMBAT_AUDIO_LIMITS.voices) {
      const victim = [...voices].find(([, item]) => item.priority <= priority)?.[0];
      if (victim) release(victim);
      else { source.disconnect(); nodes.forEach(node => node.disconnect()); return false; }
    }
    voices.set(source, { nodes, priority }); source.onended = () => release(source);
    source.start(); source.stop(context!.currentTime + duration); return true;
  }
  const audible = () => !!context && !!master && context.state === 'running' && !document.hidden && volume > 0;
  function envelope(duration: number, level: number) {
    const ctx = context!, gain = ctx.createGain(), now = ctx.currentTime;
    gain.connect(master!); gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, level), now + Math.min(.025, duration / 4));
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration); return gain;
  }
  function stopCharge() { if (charge) release(charge.source); charge = null; }
  return {
    unlock() {
      try {
        if (!context) {
          const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Constructor) return;
          context = new Constructor(); master = context.createGain(); master.gain.value = volume; master.connect(context.destination);
          noise = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch { /* Unsupported or blocked audio never prevents gameplay. */ }
    },
    setVolume(value: number) {
      volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, .03);
      if (volume === 0) { for (const source of [...voices.keys()]) release(source); }
    },
    play(sound: CombatSound, intensity = 1, priority = 2) {
      if (!audible() || !Number.isFinite(intensity) || intensity <= 0) return;
      const recipe = RECIPES[sound], ctx = context!, strength = Math.min(1, intensity);
      for (const [type, from, to, duration, level] of recipe.tones ?? []) {
        const source = ctx.createOscillator(), gain = envelope(duration, level * strength);
        source.type = type; source.frequency.setValueAtTime(from, ctx.currentTime); source.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
        source.connect(gain); track(source, [gain], duration, priority);
      }
      if (recipe.noise && noise) {
        const [type, from, to, duration, level] = recipe.noise;
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = envelope(duration, level * strength);
        source.buffer = noise; filter.type = type; filter.Q.value = .7;
        filter.frequency.setValueAtTime(from, ctx.currentTime); filter.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
        source.connect(filter); filter.connect(gain); track(source, [filter, gain], duration, priority);
      }
    },
    beginBossCharge(cast: BossCast | null) {
      stopCharge(); if (!cast || !audible() || cast.remaining <= 0) return;
      const ctx = context!, source = ctx.createOscillator(), gain = ctx.createGain();
      source.type = 'sine'; source.frequency.value = 75;
      gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.linearRampToValueAtTime(.025, ctx.currentTime + .15);
      source.connect(gain); gain.connect(master!);
      if (track(source, [gain], Math.min(11, cast.remaining + .2), 3)) charge = { source, gain, id: cast.abilityId ?? cast.name };
    },
    syncBossCharge(cast: BossCast | null) {
      if (!charge || !context) return;
      if (!cast || charge.id !== (cast.abilityId ?? cast.name) || cast.remaining <= 0 || !audible()) { stopCharge(); return; }
      const progress = Math.max(0, Math.min(1, 1 - cast.remaining / Math.max(.01, cast.total)));
      charge.source.frequency.setTargetAtTime(75 + progress * 145, context.currentTime, .06);
      charge.gain.gain.setTargetAtTime(.025 + progress * .025, context.currentTime, .06);
    },
    silence() { for (const source of [...voices.keys()]) release(source); stopCharge(); },
    dispose() { for (const source of [...voices.keys()]) release(source); stopCharge(); if (context) void context.close().catch(() => {}); context = null; master = null; noise = null; },
  };
}
