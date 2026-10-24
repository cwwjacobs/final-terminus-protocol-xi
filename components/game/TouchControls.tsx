'use client';
import { useEffect, useLayoutEffect, useRef, type PointerEvent, type MouseEvent } from 'react';
import type { Action, GameState } from '../../game/types';
import { getCooldown } from '../../game/content';
import { abilityDetail, roleAbilities } from './kit-ui';
import Icon from './Icon';
import { abilityCue } from './combat-feedback';
import { commandUnavailable } from './command-menu';
import { resetTouchStick, touchAxes, type TouchStickState } from './touch-input';

interface Props {
  state: GameState;
  slot: number;
  stick: TouchStickState;
  blocked: boolean;
  allyTarget: number | null;
  onAllyTarget: () => void;
  onAction: (action: Action) => void;
  onFocus: () => void;
}

/** Each surface owns its pointer; an ability never releases the left stick. */
export default function TouchControls({ state, slot, stick, blocked, allyTarget, onAllyTarget, onAction, onFocus }: Props) {
  const knob = useRef<HTMLSpanElement>(null);
  const origin = useRef({ x: 0, y: 0, radius: 1 });
  const reset = () => {
    resetTouchStick(stick);
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
  };
  useEffect(() => {
    const clear = () => reset();
    const hidden = () => { if (document.hidden) clear(); };
    window.addEventListener('blur', clear);
    window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clear(); window.removeEventListener('blur', clear); window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [stick]);
  useLayoutEffect(() => { if (blocked || stick.pointerId === null) reset(); });
  function update(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== stick.pointerId) return;
    const dx = event.clientX - origin.current.x, dy = event.clientY - origin.current.y;
    Object.assign(stick, touchAxes(dx, dy, origin.current.radius));
    const scale = Math.min(1, origin.current.radius / Math.max(1, Math.hypot(dx, dy)));
    if (knob.current) knob.current.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (blocked || stick.pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); onFocus();
    const box = event.currentTarget.getBoundingClientRect();
    origin.current = { x: box.left + box.width / 2, y: box.top + box.height / 2, radius: box.width * .32 };
    stick.pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== stick.pointerId) return;
    reset();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const press = (action: () => void) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (blocked || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); onFocus(); action();
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!blocked && event.detail === 0) { onFocus(); action(); }
    },
  });
  const player = state.party[slot];
  const choices = roleAbilities(player.role, allyTarget);
  // Bacchus keeps six buttons at the right thumb: Revelry sits above movement.
  const movementAbility = choices.length > 6 ? choices.find(item => item.action.type === 'revelry') : undefined;
  const mainChoices = choices.filter(item => item !== movementAbility);
  return <div className="touch-controls" hidden={blocked} aria-label="Touch controls" onContextMenu={event => event.preventDefault()}>
    <div className="touch-movement">
      {movementAbility && <button className="touch-revelry" disabled={!!commandUnavailable(state, slot, movementAbility.action)} title={movementAbility.hint} {...press(() => onAction(movementAbility.action))}><Icon name="revelry"/> Revelry <small>{getCooldown(player, movementAbility.action) > 0 ? `${Math.ceil(getCooldown(player, movementAbility.action))}s` : "+1"}</small></button>}
      <button className={`touch-engage ${player.engaged ? 'on' : ''}`} aria-pressed={player.engaged} disabled={!!commandUnavailable(state, slot, { type: 'engage' })} {...press(() => onAction({ type: 'engage' }))}>{player.engaged ? 'Disengage' : 'Engage'}</button>
      <div className="touch-stick" role="group" aria-label="Movement stick: drag to move" onPointerDown={begin} onPointerMove={update} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        <span className="touch-stick-cross" aria-hidden="true"><Icon name="cross"/></span><span className="touch-stick-knob" ref={knob} aria-hidden="true"/>
      </div>
    </div>
    <div className="touch-action-cluster">
      {player.role === 'luminary' && <button className="touch-heal-target" {...press(onAllyTarget)} aria-label="Choose healing target">Mend → {allyTarget === null ? 'Auto' : state.party[allyTarget]?.name}</button>}
      <div className="touch-ability-grid" aria-label={`${player.name} abilities`}>
        {mainChoices.map(item => {
          const reason = commandUnavailable(state, slot, item.action);
          const cue = abilityCue(state, slot, item.action, !!reason);
          const cooldown = getCooldown(player, item.action);
          const detail = reason ?? cue?.label ?? abilityDetail(player, item.action);
          return <button key={item.name} className={`ability touch-ability ${item.color} ${cue?.kind ?? ''}`} disabled={!!reason} aria-label={`${item.name}: ${detail}`} title={detail} {...press(() => onAction(item.action))}>
            <span className="ability-icon" aria-hidden="true">{cooldown > 0 ? `${cooldown < 1 ? cooldown.toFixed(1) : Math.ceil(cooldown)}s` : <Icon name={item.icon}/>}</span><strong>{item.action.type === 'aegis' ? 'Aegis' : item.name}</strong>{item.action.type === 'magic' && player.rapidWeave && <small className="rapid-charge" aria-label={`${player.rapidWeave.charges[item.action.element]} rapid casts left`}>{player.rapidWeave.charges[item.action.element]}</small>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}
