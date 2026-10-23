import type { CSSProperties, Ref } from 'react';
import type { GameState } from '../../game/types';
import { enemyMark } from './enemy-mark';

export default function EnemyMark({ state, anchor }: { state: GameState; anchor: Ref<HTMLDivElement> }) {
  const mark = enemyMark(state);
  return <div ref={anchor} className="enemy-mark-anchor" style={{ opacity: 0 }}>
    {mark && <div className={`enemy-mark ${mark.kind} ${mark.ready ? 'ready' : 'preparing'}`} style={{ '--mark-color': mark.color } as CSSProperties} role="img" aria-label={mark.label} title={mark.label}>
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle className="mark-back" cx="32" cy="32" r="27"/>
        <circle className="mark-timer" cx="32" cy="32" r="27" pathLength="100" strokeDasharray={`${mark.fraction * 100} 100`} transform="rotate(-90 32 32)"/>
        <g className="mark-symbol">
          {mark.symbol === 'cleave' && <><path d="M22 44 42 20M20 37l7 7"/><path d="m26 40 12-19 4-1-1 5Z"/></>}
          {mark.symbol === 'pierce' && <><path d="M32 45V20m-8 8 8-8 8 8M27 42V29m10 13V29"/></>}
          {mark.symbol === 'resonance' && <path d="m32 17 14 15-14 15-14-15Z"/>}
          {mark.symbol === 'fire' && <path d="M32 17c2 10 13 12 11 23-2 13-23 12-23-1 0-7 6-10 6-15 2 4 4 6 5 7 3-5 3-9 1-14Zm1 18c-8 7-7 11-1 12 6-1 7-6 1-12Z"/>}
          {mark.symbol === 'ice' && <path d="M32 17v30M19 24l26 16M19 40l26-16m-18-3 5 4 5-4m-10 22 5-4 5 4M20 29l6-1-2-6m16 20-2-6 6-1M20 35l6 1-2 6m16-20-2 6 6 1"/>}
          {mark.symbol === 'lightning' && <path d="m36 17-16 18h11l-3 13 16-20H33Z"/>}
        </g>
      </svg>
    </div>}
  </div>;
}
