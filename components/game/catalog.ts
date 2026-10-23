import type { Action } from '../../game/types.ts';

export interface AbilityPresentation {
  key: string;
  pad: string;
  name: string;
  hint: string;
  glyph: string;
  action: Action;
  color: string;
}

/** HUD labels and action bindings. Combat values remain in game/content.ts. */
export const abilities: AbilityPresentation[] = [
  { key: '1', pad: 'X', name: 'Arc Cleave', hint: 'Weaponskill · can open or close a compatible chain', glyph: '⟋', action: { type: 'weapon', id: 'cleave' }, color: 'gold' },
  { key: '2', pad: 'Y', name: 'Vector Pierce', hint: 'Weaponskill · can open or close a compatible chain', glyph: '⤊', action: { type: 'weapon', id: 'pierce' }, color: 'mint' },
  { key: '3', pad: 'RB', name: 'Resonance', hint: 'Weaponskill · can open or close a compatible chain', glyph: '◇', action: { type: 'weapon', id: 'resonance' }, color: 'violet' },
  { key: '4', pad: '↑', name: 'Fire', hint: 'Fire magic · 70 MP', glyph: '♨', action: { type: 'magic', element: 'fire' }, color: 'fire' },
  { key: '5', pad: '↓', name: 'Ice', hint: 'Ice magic · 70 MP', glyph: '❄', action: { type: 'magic', element: 'ice' }, color: 'ice' },
  { key: '6', pad: '←', name: 'Lightning', hint: 'Lightning magic · 70 MP', glyph: 'ϟ', action: { type: 'magic', element: 'lightning' }, color: 'violet' },
];
