import type { Action } from '../../game/types.ts';
import type { IconName } from './icons.ts';

export interface AbilityPresentation {
  key: string;
  pad: string;
  name: string;
  hint: string;
  icon: IconName;
  action: Action;
  color: string;
}

/** HUD labels, icon names and action bindings. Combat values remain in game/content.ts; icon outlines live in icons.ts. */
export const abilities: AbilityPresentation[] = [
  { key: '1', pad: 'X', name: 'Arc Cleave', hint: 'Weaponskill · can open or close a compatible chain', icon: 'cleave', action: { type: 'weapon', id: 'cleave' }, color: 'gold' },
  { key: '2', pad: 'Y', name: 'Vector Pierce', hint: 'Weaponskill · can open or close a compatible chain', icon: 'pierce', action: { type: 'weapon', id: 'pierce' }, color: 'mint' },
  { key: '3', pad: 'RB', name: 'Resonance', hint: 'Weaponskill · can open or close a compatible chain', icon: 'resonance', action: { type: 'weapon', id: 'resonance' }, color: 'violet' },
  { key: '4', pad: '↑', name: 'Fire', hint: 'Fire magic · 70 MP', icon: 'fire', action: { type: 'magic', element: 'fire' }, color: 'fire' },
  { key: '5', pad: '↓', name: 'Ice', hint: 'Ice magic · 70 MP', icon: 'ice', action: { type: 'magic', element: 'ice' }, color: 'ice' },
  { key: '6', pad: '←', name: 'Lightning', hint: 'Lightning magic · 70 MP', icon: 'lightning', action: { type: 'magic', element: 'lightning' }, color: 'violet' },
];
