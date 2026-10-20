import { getAttackStats, REVELRY } from '../../game/content.ts';
import type { Actor } from '../../game/types.ts';

/** Presentation only: stack grants, loss and attack calculations live in the kernel. */
export function RevelryBadge({ stacks }: { stacks: number }) {
  return <span className={`revelry-badge ${stacks > 0 ? 'active' : ''}`}
    title={`Revelry: ${stacks}/${REVELRY.maxStacks} stacks. Taking damage clears only this character's stacks.`}>
    Revelry {stacks}/{REVELRY.maxStacks}
  </span>;
}

export default function RevelryPanel({ actor, cooldown, disabled, hint, onActivate }: {
  actor: Actor; cooldown: number; disabled: boolean; hint: string; onActivate: () => void;
}) {
  const stats = getAttackStats(actor);
  const bonus = actor.revelryStacks * REVELRY.bonusPerStack;
  return <div className="revelry-panel" aria-label="Revelry and attack stats">
    <div className="revelry-values">
      <RevelryBadge stacks={actor.revelryStacks} />
      <span>Patk <b>{stats.patk}</b></span>
      <span>Matk <b>{stats.matk}</b></span>
      <small>{bonus > 0 ? `+${bonus} to each · lost when you take damage` : `Bacchus grants +${REVELRY.bonusPerStack} to each per stack`}</small>
    </div>
    {actor.id === 'bacchus' && <button className="revelry-action" disabled={disabled}
      title={`Grant every living party member one Revelry stack, up to ${REVELRY.maxStacks}. ${REVELRY.cooldown} second cooldown.`}
      onClick={event => { onActivate(); event.currentTarget.blur(); }}>
      <kbd>{hint}</kbd> Revelry <span>{cooldown > 0 ? `${Math.ceil(cooldown)}s` : '+1 party stack'}</span>
    </button>}
  </div>;
}
