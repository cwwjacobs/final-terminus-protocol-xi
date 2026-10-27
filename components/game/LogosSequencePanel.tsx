import type { GameState } from '../../game/types';
import { getRunScoreboard } from '../../game/run-stats';
import { descentReadiness, enemyTargets, offensiveTarget } from '../../game/logos';

export default function LogosSequencePanel({ state, slot, onTarget, onReady }: { state: GameState; slot: number; onTarget: (id: string) => void; onReady: (ready: boolean) => void }) {
  const { stage, elapsed } = state.logos;
  if (stage === 'none') return null;
  if (stage === 'descent') {
    const stats = getRunScoreboard(state);
    const readiness = descentReadiness(state), ready = readiness.players.find(player => player.slot === slot)?.ready ?? false;
    return <section className="logos-intermission" aria-label="Descending platform and previous battle results">
      <img src="/assets/logos/coherence-seal.svg" alt=""/><div><span className="eyebrow">The descent</span><h2>The lower arena awaits</h2><p>The platform is moving. Six silent statues surround the destination.</p></div>
      <strong className="descent-timer" role="timer">{Math.max(0,Math.ceil(60-elapsed))}<small>seconds</small></strong>
      <div className="descent-readiness"><div><p role="status" aria-live="polite">{readiness.count} / {readiness.total} players ready</p><small>Ready together to skip the remaining descent. Trusts are ready automatically.</small></div><button type="button" className="primary" data-autofocus aria-pressed={ready} disabled={!state.party[slot]?.human} onClick={()=>onReady(!ready)}>{ready?'Ready · undo':'Ready up · skip wait'}</button><ul aria-label="Descent readiness">{readiness.players.map(player=><li key={player.slot} className={player.ready?'ready':''}><span>{player.name}</span><small>{player.ready?'Ready':'Reviewing'}</small></li>)}</ul></div>
      <div className="descent-stats"><table><caption>Crown Resonance · battle record</caption><thead><tr><th>Hero</th><th>Damage</th><th>Healing</th><th>Deaths</th></tr></thead><tbody>{stats.rows.map(row=><tr key={row.id}><th style={{color:row.color}}>{row.name}</th><td>{Math.round(row.damage).toLocaleString()}</td><td>{Math.round(row.healing).toLocaleString()}</td><td>{row.deaths}</td></tr>)}</tbody></table></div>
    </section>;
  }
  if (stage === 'collapse' || stage === 'escaped') return <section className={`logos-collapse ${stage}`} role="status"><span className="eyebrow">{stage === 'escaped' ? 'Beyond the scaffolding' : 'Coherence failing'}</span><h2>{stage === 'escaped' ? 'The party escapes.' : 'The floor is disappearing.'}</h2><p>{stage === 'escaped' ? 'Logos survives. His world no longer holds its shape around you.' : 'The lattice falls away. Hold together.'}</p></section>;
  const selected = offensiveTarget(state,state.party[slot]);
  const current = 'id' in selected ? selected.id : 'boss';
  return <section className="logos-targets" aria-label="Logos encounter targets"><span>{stage === 'sentinels' ? 'The statues awaken' : 'Hold the hands · strike the head'}</span><div>{enemyTargets(state).map(target=>{
    const enemy=target.id==='boss'?state.boss:state.enemies.find(e=>e.id===target.id);
    return <button key={target.id} aria-pressed={current===target.id} onClick={()=>onTarget(target.id)}><b>{target.name}</b><small>{Math.ceil(target.hp).toLocaleString()} HP{enemy&&enemy.stunRemaining>0?' · stunned':''}{enemy?.burn?' · burning':''}</small><i style={{width:`${target.hp/target.maxHp*100}%`}}/></button>;
  })}</div>{stage==='giant'&&<small>Head damage doubles while the hands are held by melee heroes or staggered.</small>}</section>;
}
