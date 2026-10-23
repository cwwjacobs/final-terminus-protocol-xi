import type { CSSProperties } from 'react';
import { BURST_WINDOW, CHAIN_MIN_DELAY, CHAIN_WINDOW, MAGIC, SKILLCHAINS, WEAPONS } from '../../game/content.ts';
import type { Element, GameState } from '../../game/types.ts';
import { activeBurst, completedChainActors } from './combat-feedback.ts';
import Icon from './Icon';
import type { IconName } from './icons.ts';

const elements: Record<Element, { label: string; icon: IconName }> = {
  fire: { label: 'Fire', icon: 'fire' }, ice: { label: 'Ice', icon: 'ice' }, lightning: { label: 'Lightning', icon: 'lightning' },
};

export default function SkillchainPanel({ state }: { state: GameState }) {
  if (state.status !== 'fighting') return null;
  const burst = activeBurst(state), chain = state.chain;
  if (!burst && (!chain || chain.remaining <= 0)) return null;
  const element = burst ? elements[burst.element] : null;
  const property = burst ? Object.values(SKILLCHAINS).find(recipe => recipe.element === burst.element)?.property : null;
  const remaining = burst?.remaining ?? chain!.remaining;
  const wait = chain ? Math.max(0, CHAIN_MIN_DELAY - (state.time - chain.openedAt)) : 0;
  const lastBurst = state.events.filter(event => event.kind === 'burst').at(-1);
  const landed = burst && lastBurst && state.combatTime - lastBurst.time >= 0 && state.combatTime - lastBurst.time < 2.2 ? lastBurst : null;
  const color = burst ? MAGIC[burst.element].color : '#e2c88b';
  return <section className={`resonance-banner chain-feedback ${burst ? 'burst' : 'opener'}`}
    style={{ '--cue-color': color } as CSSProperties} aria-label={burst ? `${element!.label} magic burst window` : 'Weaponskill chain opener'}>
    <div className="chain-feedback-heading"><span>{burst ? `${property} · SKILLCHAIN COMPLETE` : 'WEAPONSKILL OPENER'}</span><b role="timer">{remaining.toFixed(1)}s</b></div>
    <div className="chain-feedback-title" aria-live="polite"><span aria-hidden="true"><Icon name={element?.icon ?? 'resonance'}/></span><strong>{burst ? `${element!.label.toUpperCase()} MAGIC BURST` : `${WEAPONS[chain!.weapon].name} → ${WEAPONS[WEAPONS[chain!.weapon].next].name}`}</strong></div>
    <p>{burst ? `${completedChainActors(state)} · Hecate: cast ${element!.label}` : `${state.party[chain!.opener]?.name} opened · ${wait > 0 ? `Closer ready in ${wait.toFixed(1)}s` : 'Another party member can close now'}`}</p>
    <div className="chain-countdown" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, remaining / (burst ? BURST_WINDOW : CHAIN_WINDOW))) * 100}%` }}/></div>
    {landed && <div key={landed.id} className="burst-landed" role="status"><Icon name="revelry"/> MAGIC BURST LANDED <b>{landed.value?.toLocaleString()} DAMAGE</b></div>}
  </section>;
}
