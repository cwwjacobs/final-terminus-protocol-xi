import type { CSSProperties } from 'react';
import type { GameState } from '../../game/types';
import { enemyMark } from './enemy-mark';
import Icon from './Icon';

export default function EnemyMark({ state }: { state: GameState }) {
  const mark = enemyMark(state);
  return <div className="boss-seal-slot" aria-label="Enemy seal status">
    {mark && <div className={`boss-seal ${mark.kind}`} style={{ '--mark-color': mark.color } as CSSProperties} aria-label={`${mark.label}, ${mark.remaining.toFixed(1)} seconds remaining`}>
      <Icon name={mark.symbol}/><span>{mark.kind === 'burst' ? `${mark.symbol} · Magic Burst` : `${mark.symbol} · ${mark.ready ? 'Chain ready' : 'Preparing'}`}</span>
      <b>{mark.remaining.toFixed(1)}s</b><i style={{ width: `${mark.fraction * 100}%` }}/>
    </div>}
  </div>;
}
