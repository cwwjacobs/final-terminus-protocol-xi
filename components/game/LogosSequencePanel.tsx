import type { GameState } from '../../game/types';
import { getRunScoreboard } from '../../game/run-stats';
import { enemyTargets, offensiveTarget } from '../../game/logos';

export default function LogosSequencePanel({ state, slot, onTarget }: { state: GameState; slot: number; onTarget: (id: string) => void }) {
  const { stage, elapsed } = state.logos;
  if (stage === 'none') return null;
  if (stage === 'descent') {
    const stats = getRunScoreboard(state);
    return <section className="logos-intermission" aria-label="Descending platform and previous battle results">
      <img src="/assets/logos/coherence-seal.svg" alt=""/><div><span className="eyebrow">The descent</span><h2>The lower arena awaits</h2><p>The platform is moving. Six silent statues surround the destination.</p></div>
      <strong className="descent-timer" role="timer">{Math.max(0,Math.ceil(60-elapsed))}<small>seconds</small></strong>
      <div className="descent-stats"><table><caption>Crown Resonance · battle record</caption><thead><tr><th>Hero</th><th>Damage</th><th>Healing</th><th>Deaths</th></tr></thead><tbody>{stats.rows.map(row=><tr key={row.id}><th style={{color:row.color}}>{row.name}</th><td>{Math.round(row.damage).toLocaleString()}</td><td>{Math.round(row.healing).toLocaleString()}</td><td>{row.deaths}</td></tr>)}</tbody></table></div>
    </section>;
  }
  if (stage === 'collapse' || stage === 'escaped') return <section className={`logos-collapse ${stage}`} role="status"><span className="eyebrow">{stage === 'escaped' ? 'Beyond the scaffolding' : 'Coherence failing'}</span><h2>{stage === 'escaped' ? 'The party escapes.' : 'The floor is disappearing.'}</h2><p>{stage === 'escaped' ? 'Logos survives. His world no longer holds its shape around you.' : 'The lattice falls away. Hold together.'}</p></section>;
  const selected = offensiveTarget(state,state.party[slot]);
  const current = 'id' in selected ? selected.id : 'boss';
  return <section className="logos-targets" aria-label="Logos encounter targets"><span>{stage === 'sentinels' ? 'The statues awaken' : 'Hold the hands · strike the head'}</span><div>{enemyTargets(state).map(target=><button key={target.id} aria-pressed={current===target.id} onClick={()=>onTarget(target.id)}><b>{target.name}</b><small>{Math.ceil(target.hp).toLocaleString()} HP</small><i style={{width:`${target.hp/target.maxHp*100}%`}}/></button>)}</div>{stage==='giant'&&<small>Head damage doubles while the hands are held by melee heroes or staggered.</small>}</section>;
}
