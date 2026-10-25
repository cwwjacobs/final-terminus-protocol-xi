import { ELEMENTS, MAGIC, SKILLCHAINS, WEAPONS } from '../../game/content.ts';
import type { Element, WeaponId } from '../../game/types.ts';

/** Small structural interface also accepted by animation-only previews. */
export interface PresentationCue {
  kind: string;
  text: string;
  source?: string;
  abilityId?: string;
  weaponId?: WeaponId;
  element?: Element;
  sequenceId?: number;
  hitIndex?: number;
}

export type PresentationKey =
  | 'auto' | WeaponId | Element | 'elementalShot'
  | 'criticalDash' | 'splitVolley' | 'rapidWeave' | 'aegis'
  | 'revelry' | 'provoke' | 'heal' | 'shimmerWave' | 'mendingThread'
  | 'guard' | 'dodge' | 'hit' | 'down' | 'chain' | 'shieldBreak'
  | 'bossCast' | 'bossImpact' | 'staticStrike' | 'staticDischarge' | 'buffLost';

const signatures = ['criticalDash', 'splitVolley', 'rapidWeave', 'aegis', 'shimmerWave', 'mendingThread', 'elementalShot'] as const;
const supported = new Set(['auto', 'weapon', 'magic', 'burst', 'ability', 'shimmer_wave', 'heal']);

/** Resolve explicit identity before inspecting legacy labels. No gameplay writes. */
export function presentationElement(cue: PresentationCue): Element | null {
  if (cue.element !== undefined) return ELEMENTS.includes(cue.element) ? cue.element : null;
  if (cue.abilityId?.startsWith('magic:')) {
    const element = cue.abilityId.slice(6) as Element;
    return ELEMENTS.includes(element) ? element : null;
  }
  // These names are only a migration fallback for old events and isolated previews.
  for (const element of ELEMENTS) {
    const shot = element === 'fire' ? 'Fire Shot' : element === 'ice' ? 'Ice Shot' : 'Lightning Shot';
    if (cue.text.includes(MAGIC[element].name) || cue.text.includes(shot)) return element;
  }
  if (cue.kind === 'chain') {
    for (const chain of Object.values(SKILLCHAINS)) if (cue.text.includes(chain.property)) return chain.element;
  }
  return null;
}

/** Event semantics select one presentation. In particular, multi-hit signatures
 * never become ordinary weaponskills, and a shield break never re-casts Aegis. */
export function presentationKey(cue: PresentationCue): PresentationKey | null {
  switch (cue.kind) {
    case 'cast': return 'bossCast';
    case 'boss_impact': case 'enrage': return 'bossImpact';
    case 'static_strike': return 'staticStrike';
    case 'static_discharge': case 'static_arc': return 'staticDischarge';
    case 'shield': return 'shieldBreak';
    case 'revelry_lost': return 'buffLost';
    case 'chain': return 'chain';
    case 'hit': return 'hit';
    case 'down': return 'down';
    case 'evade': case 'dodge': return 'dodge';
    case 'revelry': return 'revelry';
    case 'provoke': return 'provoke';
    case 'guard': return 'guard';
  }
  if (!supported.has(cue.kind)) return null;
  for (const id of [cue.source, cue.abilityId]) {
    if (signatures.includes(id as typeof signatures[number])) return id as typeof signatures[number];
  }
  if (cue.kind === 'shimmer_wave') return 'shimmerWave';
  if (cue.kind === 'heal') return 'heal';
  if (cue.kind === 'auto') return 'auto';
  if (cue.kind === 'weapon') {
    if (cue.weaponId !== undefined) return Object.hasOwn(WEAPONS, cue.weaponId) ? cue.weaponId : null;
    if (cue.abilityId?.startsWith('weapon:')) {
      const id = cue.abilityId.slice(7) as WeaponId;
      return Object.hasOwn(WEAPONS, id) ? id : null;
    }
    // Current events use weaponId. Preserve standalone previews and old saves.
    return (Object.keys(WEAPONS) as WeaponId[]).find(id => cue.text.includes(WEAPONS[id].name)) ?? null;
  }
  if (cue.kind === 'magic' || cue.kind === 'burst') return presentationElement(cue);
  return null;
}

/** Seconds from visual playback start to contact. The engine has already
 * resolved the action; scheduled multi-hit, healing and defensive effects stay
 * immediate. Kept shared so body motion, effects and sound use one schedule. */
export function presentationContact(cue: PresentationCue, actorId?: string): number {
  const key = presentationKey(cue);
  if (key === 'auto') return actorId === 'bacchus' ? .27 : .20;
  if (key === 'cleave') return actorId === 'bacchus' ? .43 : .36;
  if (key === 'pierce') return actorId === 'bacchus' ? .30 : .28;
  if (key === 'resonance') return actorId === 'bacchus' ? .48 : .44;
  if (key === 'fire' || key === 'ice' || key === 'lightning') return .30;
  if (key === 'elementalShot') return .20;
  return 0;
}
