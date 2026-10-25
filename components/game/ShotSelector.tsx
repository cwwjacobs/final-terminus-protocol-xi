import type { Action, Element } from '../../game/types';
import Icon from './Icon';
export default function ShotSelector({ element, onAction, cycleHint }: { element: Element; onAction: (action: Action) => void; cycleHint?: string }) {
  return <div className="shot-selector" role="group" aria-label="Choose shot element">
    <span>SHOT</span>{(['fire', 'ice', 'lightning'] as const).map(value => <button key={value} type="button" aria-pressed={element === value} aria-label={`Select ${value} shot`} onClick={() => onAction({ type: 'selectShot', element: value })}><Icon name={value}/>{value === 'lightning' ? 'Lightning' : value === 'ice' ? 'Ice' : 'Fire'}</button>)}
    {cycleHint && <small>{cycleHint} · change</small>}
  </div>;
}
