'use client';
import { useEffect, useLayoutEffect, useRef, type PointerEvent, type MouseEvent } from 'react';
import type { Action, GameState } from '../../game/types';
import { getCooldown } from '../../game/content';
import { abilityDetail, roleActionSlots } from './kit-ui';
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
  onUnavailable?: (reason: string) => void;
}

/** Each surface owns its pointer; an ability never releases the left stick. */
export default function TouchControls({ state, slot, stick, blocked, allyTarget, onAllyTarget, onAction, onFocus, onUnavailable }: Props) {
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
  const choices = roleActionSlots(player.role, allyTarget);
  return <div className="touch-controls direct-touch" hidden={blocked} aria-label="Touch controls" onContextMenu={event => event.preventDefault()}>
    <div className="touch-movement">
      <div className="touch-stick" role="group" aria-label="Movement stick: drag to move" onPointerDown={begin} onPointerMove={update} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        <span className="touch-stick-cross" aria-hidden="true"><Icon name="cross"/></span><span className="touch-stick-knob" ref={knob} aria-hidden="true"/>
      </div>
    </div>
    <div className="touch-action-cluster">
      {player.role === 'luminary' && <button className="touch-heal-target" {...press(onAllyTarget)} aria-label="Choose healing target">Restore → {allyTarget === null ? 'Auto' : state.party[allyTarget]?.name}</button>}
      <div className="touch-ability-grid" aria-label={`${player.name} abilities`}>
        {choices.map(({ id, command, presentation: item }) => {
          const reason = commandUnavailable(state, slot, item.action);
          const cue = abilityCue(state, slot, item.action, !!reason);
          const cooldown = getCooldown(player, item.action);
          const detail = reason ?? cue?.label ?? abilityDetail(player, item.action);
          const name = command === 'engage' ? player.engaged ? 'Disengage' : 'Engage' : item.name;
          return <button key={id} data-slot={id} className={`direct-touch-ability ${item.color} ${cue?.kind ?? ''}`} aria-disabled={!!reason} aria-pressed={command === 'engage' ? player.engaged : undefined} aria-label={`${name}: ${detail}`} title={detail} {...press(() => { if (reason) onUnavailable?.(reason); else onAction(item.action); })}>
            <Icon name={command === 'engage' ? player.engaged ? 'engaged' : 'disengaged' : item.icon}/>
            {cooldown > 0 && <span className="direct-recast" aria-hidden="true">{cooldown < 1 ? cooldown.toFixed(1) : Math.ceil(cooldown)}s</span>}
            <strong>{name}</strong>{item.action.type === 'magic' && player.rapidWeave && <small className="direct-charges" aria-label={`${player.rapidWeave.charges[item.action.element]} rapid casts left`}>{player.rapidWeave.charges[item.action.element]}</small>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}
