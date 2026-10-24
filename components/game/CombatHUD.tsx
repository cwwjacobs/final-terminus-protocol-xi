'use client';
import type { Action, GameState } from '../../game/types';
import { getCooldown } from '../../game/content';
import { effectiveBindingCommand, keyLabel, buttonLabel, type ControlSettings } from './control-settings';
import { roleActionSlots, abilityDetail } from './kit-ui';
import { abilityCue } from './combat-feedback';
import { commandUnavailable } from './command-menu';
import Icon from './Icon';
import ShotSelector from './ShotSelector';
import './combat-hud.css';

export interface CombatHUDProps {
  state: GameState;
  slot: number;
  controls: ControlSettings;
  interface: 'desktop' | 'controller' | 'touch';
  selectedAlly: number | null;
  onAction: (action: Action) => void;
  onFocus: () => void;
  onAllyTarget?: () => void;
  onUnavailable?: (reason: string) => void;
  notice?: string;
}

/** One persistent action surface; status indicators never activate abilities. */
export default function CombatHUD({ state, slot, controls, interface: layout, selectedAlly, onAction, onFocus, onAllyTarget, onUnavailable, notice }: CombatHUDProps) {
  const actor = state.party[slot];
  const mode = layout === 'controller' ? 'controller' : 'keyboard';
  const slots = roleActionSlots(actor.role, selectedAlly);
  const hint = (command: typeof slots[number]['command']) => {
    const binding = effectiveBindingCommand(actor.role, command, controls, mode);
    if (!binding) return 'Unbound';
    return mode === 'controller'
      ? controls.buttons[binding] === undefined ? 'Unbound' : buttonLabel(controls.buttons[binding]!)
      : keyLabel(controls.keys[binding]);
  };
  return <section className="direct-combat-hud" data-interface={layout} aria-label={`${actor.name} combat controls`}>
    {notice && layout !== 'touch' && <div className="combat-notice" role="status">{notice}</div>}
    <div className="direct-status">
      <div className="direct-resource-row">
        <span className="direct-actor" style={{ color: actor.color }}>{actor.name}</span>
        {([{ name: 'HP', value: actor.hp, max: actor.maxHp, color: 'hp' }, { name: 'MP', value: actor.mp, max: actor.maxMp, color: 'mp' }, { name: 'TP', value: actor.tp, max: 3000, color: 'tp' }] as const).map(resource =>
          <div className={`direct-resource ${resource.color}`} key={resource.name} aria-label={`${resource.name}: ${Math.ceil(resource.value)} of ${resource.max}`}>
            <div><span>{resource.name}</span><b>{Math.ceil(resource.value)}<small> / {resource.max}</small></b></div>
            <span className="direct-resource-track"><i style={{ width: `${Math.max(0, Math.min(100, resource.value / resource.max * 100))}%` }}/></span>
          </div>)}
      </div>
      <div className="direct-buffs" aria-label="Active effects">
        {actor.revelryStacks > 0 && <span title="Revelry stacks; lost after taking damage"><Icon name="revelry"/> {actor.revelryStacks}/5</span>}
        {actor.shieldCharges > 0 && <span title="Aegis blocks the next hit"><Icon name="aegis"/> 1 hit</span>}
        {actor.selfChainUntil > state.time && <span>Self-chain {Math.ceil(actor.selfChainUntil - state.time)}s</span>}
        {actor.rapidWeave && <span>Rapid Weave {Math.ceil(actor.rapidWeave.remaining)}s</span>}
        {actor.elementalCycle.elements.length > 0 && <span>Cycle {actor.elementalCycle.elements.length}/3</span>}
      </div>
    </div>
    {layout !== 'touch' && actor.role === 'hunter' && <ShotSelector element={actor.shotElement} onAction={onAction} cycleHint={mode === 'controller' ? controls.buttons.selectShot === undefined ? undefined : buttonLabel(controls.buttons.selectShot) : keyLabel(controls.keys.selectShot)}/>}
    {layout !== 'touch' && <div className={layout === 'controller' ? 'direct-pad-actions' : 'direct-actions'} aria-label={`${actor.name} abilities`}>
      {slots.map(({ id, command, presentation: item }) => {
        const reason = commandUnavailable(state, slot, item.action);
        const remaining = getCooldown(actor, item.action);
        const cue = abilityCue(state, slot, item.action, !!reason);
        const binding = hint(command);
        const shot = item.action.type === 'elementalShot';
        const shotName = `${actor.shotElement === 'fire' ? 'Fire' : actor.shotElement === 'ice' ? 'Ice' : 'Lightning'} Shot`;
        const name = shot ? shotName : command === 'engage' ? actor.engaged ? 'Disengage' : 'Engage' : item.name;
        const detail = reason ?? cue?.label ?? abilityDetail(actor, item.action);
        return <button type="button" key={id} data-slot={id} className={`direct-ability ${item.color} ${cue?.kind ?? ''} ${command === 'engage' && actor.engaged ? 'engaged' : ''}`}
          aria-disabled={!!reason} aria-pressed={command === 'engage' ? actor.engaged : undefined}
          aria-label={`${name} · ${binding} · ${detail}`} title={`${name} · ${binding}\n${reason ?? item.hint}`}
          onClick={event => { if (reason) onUnavailable?.(reason); else onAction(item.action); event.currentTarget.blur(); onFocus(); }}>
          <kbd className={binding === 'Unbound' ? 'unbound' : undefined}>{binding}</kbd>
          <span className="direct-action-icon" aria-hidden="true"><Icon name={command === 'engage' ? actor.engaged ? 'engaged' : 'disengaged' : shot ? actor.shotElement : item.icon}/></span>
          {remaining > 0 && <span className="direct-recast">{remaining < 1 ? remaining.toFixed(1) : Math.ceil(remaining)}s</span>}
          <span className="direct-action-name">{name}</span>
          {item.action.type === 'magic' && actor.rapidWeave && <span className="direct-charges" title="Rapid casts remaining">{actor.rapidWeave.charges[item.action.element]}</span>}
        </button>;
      })}
    </div>}
    {layout !== 'touch' && actor.role === 'luminary' && onAllyTarget && <button type="button" className="direct-heal-target" onClick={onAllyTarget}>Restore → {selectedAlly === null ? 'Auto' : state.party[selectedAlly]?.name}</button>}
  </section>;
}
