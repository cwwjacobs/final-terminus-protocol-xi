'use client';
import { PARTY, ROLES, TRAITS } from '../../game/content.ts';
import Icon from './Icon';
import { roleIcon } from './icons';
import { roleActionSlots } from './kit-ui.ts';
import './hero-picker.css';

export interface HeroPickerMember { slot: number; connected: boolean; reserved: boolean }
export interface HeroPickerProps {
  selectedSlot: number;
  onSelect: (slot: number) => void;
  busy?: boolean;
  members?: HeroPickerMember[];
  ownSlot?: number;
  lobby?: boolean;
  autoFocus?: boolean;
}

/** Hero identity and previews come from the same registries as combat. */
export default function HeroPicker({ selectedSlot, onSelect, busy = false, members, ownSlot, lobby = false, autoFocus = false }: HeroPickerProps) {
  const selected = PARTY[selectedSlot] ?? PARTY[0];
  const trait = TRAITS[selected.role];
  const abilities = roleActionSlots(selected.role).filter(slot => slot.id.startsWith('primary') || slot.id.startsWith('utility'));
  return <div className="hero-picker">
    <div className="hero-picker-grid" role="group" aria-label="Choose your hero">
      {PARTY.map((hero, index) => {
        const member = members?.find(item => item.slot === index);
        const unavailable = lobby && index !== ownSlot && !!(member?.connected || member?.reserved);
        const chosen = index === selectedSlot;
        const status = unavailable ? member?.connected ? 'PLAYER' : 'RECONNECTING' : chosen ? lobby ? 'YOUR HERO' : 'SELECTED' : lobby ? 'AVAILABLE' : '';
        return <button type="button" key={hero.id} className="hero-picker-card" aria-label={`Select ${hero.name}`} aria-pressed={chosen}
          data-autofocus={autoFocus && chosen || undefined} disabled={busy || unavailable}
          onClick={() => onSelect(index)} title={unavailable ? `${hero.name} is ${member?.connected ? 'being played by another player' : 'reserved for a reconnecting player'}.` : ROLES[hero.role].description}>
          <span className="hero-picker-sigil" style={{ color: hero.color }}><Icon name={roleIcon(hero.role)}/></span>
          <span className="hero-picker-identity"><strong>{hero.name}</strong><small>{hero.role}</small><span className="hero-picker-trait">{TRAITS[hero.role].name}</span></span>
          {status && <span className="hero-picker-status">{status}</span>}
        </button>;
      })}
    </div>
    <section className="hero-picker-preview" aria-label={`${selected.name} overview`} aria-live="polite">
      <p className="hero-picker-role-description">{ROLES[selected.role].description}</p>
      <p className="hero-picker-trait-detail"><strong>{trait.name}</strong> {trait.description}</p>
      <ul className="hero-picker-abilities" aria-label={`${selected.name} abilities`}>
        {abilities.map(({ id, presentation }) => <li key={id} title={presentation.hint}><Icon name={presentation.icon}/><span>{presentation.name}</span></li>)}
      </ul>
    </section>
  </div>;
}
