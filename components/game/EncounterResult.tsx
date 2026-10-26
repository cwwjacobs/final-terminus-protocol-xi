'use client';
import { useState } from 'react';
import type { getRunScoreboard } from '../../game/run-stats.ts';
import Icon from './Icon';
import { trapDialogTab } from './dialog-navigation';

const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const duration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function EncounterResult({ won, time, mode, online, busy, controller, scoreboard, playerSlot, onClose, onReplay, onStart, onLeave, onLobby, onFaceLogos }: {
  won: boolean; time: string; mode: string; online: boolean; busy: boolean; controller: boolean;
  scoreboard: ReturnType<typeof getRunScoreboard>; playerSlot: number;
  onClose: () => void; onReplay: () => void; onStart: () => void; onLeave: () => void; onLobby?: () => void;
  onFaceLogos?: () => void;
}) {
  const [statsOpen, setStatsOpen] = useState(false);
  const hasRecordedStats = !scoreboard.partial || scoreboard.seconds > 0;
  return <div className="result-backdrop" onClick={onClose}>
    <section className={`result-card${statsOpen ? ' with-scoreboard' : ''}`} role="dialog" aria-modal="true" aria-labelledby="result-title"
      onClick={event => event.stopPropagation()} onKeyDown={trapDialogTab}>
      <header className="result-heading">
        <div className="result-topline"><span className="eyebrow">ENCOUNTER COMPLETE</span>
          <button className="result-close" aria-label="Close results" onClick={onClose}><Icon name="close"/> Close</button></div>
        <h2 id="result-title">{won ? 'Victory' : 'Party defeated'}</h2>
        <p>{time} · {mode}</p>
      </header>
      <div className="result-content">
        {hasRecordedStats ? <>
          <dl className="result-totals" aria-label="Party run totals">
            <div><dt>Party DPS</dt><dd>{rate.format(scoreboard.totals.dps)}</dd></div>
            <div><dt>Healing</dt><dd>{amount.format(scoreboard.totals.healing)}</dd></div>
          </dl>
          {scoreboard.partial && <p className="result-partial">Recorded since resume · {duration(scoreboard.seconds)} tracked</p>}
          <button className="result-stats-toggle" aria-expanded={statsOpen} aria-controls="run-stats" onClick={() => setStatsOpen(open => !open)}>
            <span>{statsOpen ? 'Hide run stats' : 'Run stats'}</span><span aria-hidden="true">{statsOpen ? '−' : '+'}</span>
          </button>
          <section id="run-stats" className="result-stats-panel" aria-label="Run statistics" hidden={!statsOpen}>
            <div className="result-table-scroll" role="region" aria-label="Character statistics table; left and right scroll columns" tabIndex={0}>
              <table className="result-table">
                <caption>Character statistics · highest damage first</caption>
                <thead><tr><th scope="col">Character</th><th scope="col">Damage</th><th scope="col"><abbr title="Damage per second">DPS</abbr></th><th scope="col">Healing</th><th scope="col"><abbr title="Damage taken">Taken</abbr></th><th scope="col">Deaths</th></tr></thead>
                <tbody>{scoreboard.rows.map(row => <tr key={row.id} className={row.slot === playerSlot ? 'result-player-row' : undefined}>
                  <th scope="row"><span className="result-actor" style={{ color: row.color }}>{row.name}</span>{row.slot === playerSlot && <small className="result-you">YOU</small>}</th>
                  <td>{amount.format(row.damage)}</td><td>{rate.format(row.dps)}</td><td>{amount.format(row.healing)}</td><td>{amount.format(row.taken)}</td><td>{row.deaths}</td>
                </tr>)}</tbody>
                <tfoot><tr><th scope="row">Party total</th><td>{amount.format(scoreboard.totals.damage)}</td><td>{rate.format(scoreboard.totals.dps)}</td><td>{amount.format(scoreboard.totals.healing)}</td><td>{amount.format(scoreboard.totals.taken)}</td><td>{scoreboard.totals.deaths}</td></tr></tfoot>
              </table>
            </div>
            <p className="result-stats-note">DPS uses {scoreboard.partial ? 'the recorded' : 'the full'} encounter time ({duration(scoreboard.seconds)}), excluding pauses. Healing counts HP restored; Taken counts HP lost.</p>
            {scoreboard.partial && <p className="result-stats-note">Earlier activity in this saved run is unavailable.</p>}
          </section>
        </> : <p className="result-partial">Statistics are unavailable for this older run. New encounters record the full party’s results.</p>}
      </div>
      <div className="result-actions">
        {onFaceLogos && <button className="primary" disabled={busy} onClick={onFaceLogos}>Descend to Logos <Icon name="arrow"/></button>}
        {online ? <button autoFocus className="primary" disabled={busy} onClick={onLobby ?? onClose}>{onLobby ? 'Party lobby' : 'Back to arena'}</button>
          : <button autoFocus className="primary" onClick={onReplay}>Play again <Icon name="arrow"/></button>}
        {online ? <button disabled={busy} onClick={onLeave}>Leave party</button>
          : <button onClick={onStart}>Back to start</button>}
      </div>
      <small>{controller ? 'A select · B close · Menu opens game menu' : 'Esc or Close returns to the arena'}</small>
    </section>
  </div>;
}
