import type { GameState } from '../../game/types';
import { offensiveTarget } from '../../game/logos';
import './ground-enemy-panel.css';

/** Selection uses the shared combat command. */
export default function GroundEnemyPanel({ state, slot, onTarget, targetHint }: {
  state: GameState;
  slot: number;
  onTarget: (id: string) => void;
  targetHint: string;
}) {
  if (state.encounter !== 'crown' || state.status !== 'fighting') return null;
  const enemies = state.enemies.filter(enemy => enemy.id.startsWith('ground-') && enemy.hp > 0);
  if (!enemies.length) return null;
  const target = offensiveTarget(state, state.party[slot]);
  const selected = 'id' in target ? target.id : 'boss';
  return <section className="ground-enemy-panel" aria-label="Living ground targets">
    <div className="ground-enemy-heading">
      <span>Living ground</span>
      <button type="button" aria-pressed={selected === 'boss'} onClick={event => { onTarget('boss'); event.currentTarget.blur(); }}
        aria-label="Target Crown Resonance">Crown <span aria-hidden="true">↗</span></button>
    </div>
    <div className="ground-enemy-list">
      {enemies.map(enemy => {
        const rising = (enemy.emergeRemaining ?? 0) > 0;
        const name = enemy.kind === 'storm-shard' ? 'Storm shard' : 'Ground shard';
        const status = rising ? `Strike · ${enemy.emergeRemaining!.toFixed(1)}s` : enemy.stunRemaining > 0 ? 'Stunned' : enemy.kind === 'storm-shard' ? 'Ranged' : 'Melee';
        return <button key={enemy.id} type="button" className={`ground-enemy-target${rising ? ' rising' : ''}`}
          aria-pressed={selected === enemy.id}
          aria-label={`Target ${name}, ${Math.ceil(enemy.hp)} of ${enemy.maxHp} HP, ${status}`}
          onClick={event => { onTarget(enemy.id); event.currentTarget.blur(); }}>
          <b>{name}</b>
          <small>{status}<span>{Math.ceil(enemy.hp)}</span></small>
          <span className="ground-enemy-health" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, enemy.hp / enemy.maxHp * 100))}%` }}/></span>
        </button>;
      })}
    </div>
    <p>Break awakened shards · {targetHint === 'Tap' ? 'tap to target' : `${targetHint} cycles targets`}</p>
  </section>;
}
