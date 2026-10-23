import type { CSSProperties, Ref } from 'react';
import type { GameState } from '../../game/types';
import { enemyMark } from './enemy-mark';
import { ABILITY_MARKS } from './icons';

export default function EnemyMark({ state, anchor }: { state: GameState; anchor: Ref<HTMLDivElement> }) {
  const mark = enemyMark(state);
  return <div ref={anchor} className="enemy-mark-anchor" style={{ opacity: 0 }}>
    {mark && <div className={`enemy-mark ${mark.kind} ${mark.ready ? 'ready' : 'preparing'}`} style={{ '--mark-color': mark.color } as CSSProperties} role="img" aria-label={mark.label} title={mark.label}>
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle className="mark-back" cx="32" cy="32" r="27"/>
        <circle className="mark-timer" cx="32" cy="32" r="27" pathLength="100" strokeDasharray={`${mark.fraction * 100} 100`} transform="rotate(-90 32 32)"/>
        <g className="mark-symbol">
          {ABILITY_MARKS[mark.symbol].map((shape, index) => <path key={index} d={shape.d}/>)}
        </g>
      </svg>
    </div>}
  </div>;
}
