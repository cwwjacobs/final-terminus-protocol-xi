'use client';
import Icon from './Icon';
import { trapDialogTab } from './dialog-navigation';

export default function EncounterResult({ won, time, mode, online, busy, controller, onClose, onReplay, onStart, onLeave }: {
  won: boolean; time: string; mode: string; online: boolean; busy: boolean; controller: boolean;
  onClose: () => void; onReplay: () => void; onStart: () => void; onLeave: () => void;
}) {
  return <div className="result-backdrop" onClick={onClose}>
    <section className="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"
      onClick={event => event.stopPropagation()} onKeyDown={trapDialogTab}>
      <button className="result-close" aria-label="Close results" onClick={onClose}><Icon name="close"/> Close</button>
      <span className="eyebrow">ENCOUNTER COMPLETE</span>
      <h2 id="result-title">{won ? 'Victory' : 'Party defeated'}</h2>
      <p>{time} · {mode}</p>
      <div className="result-actions">
        {online ? <button autoFocus className="primary" onClick={onClose}>Back to arena</button>
          : <button autoFocus className="primary" onClick={onReplay}>Play again <Icon name="arrow"/></button>}
        {online ? <button disabled={busy} onClick={onLeave}>{busy ? 'Leaving…' : 'Leave party'}</button>
          : <button onClick={onStart}>Back to start</button>}
      </div>
      <small>{controller ? 'A select · B close · Menu opens game menu' : 'Esc or Close returns to the arena'}</small>
    </section>
  </div>;
}
