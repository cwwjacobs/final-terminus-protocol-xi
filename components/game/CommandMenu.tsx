'use client';
import { useEffect, useRef } from 'react';
import { commandPageTitle, type CommandEntry, type CommandMenuState, type MenuIntent } from './command-menu';
import Icon from './Icon';

interface Props {
  state: CommandMenuState;
  rows: readonly CommandEntry[];
  actorName: string;
  hint: string;
  disabled: boolean;
  onInput: (intent: MenuIntent) => void;
  onChoose: (index: number) => void;
  onHighlight: (index: number) => void;
}

export default function CommandMenu({ state, rows, actorName, hint, disabled, onInput, onChoose, onHighlight }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.open && !disabled) {
      const button = panel.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
      (button ?? panel.current)?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: 'nearest' });
    }
  }, [state.open, state.page, state.index, disabled]);
  const selected = rows[Math.min(state.index, Math.max(0, rows.length - 1))];
  return <div className="command-menu" data-command-menu="true">
    <button className="command-toggle" data-command-native="true" disabled={disabled}
      aria-expanded={state.open} aria-label={state.open ? 'Collapse command menu' : 'Open command menu'} aria-controls="battle-commands" onClick={e => { onInput(state.open ? 'close' : 'open'); e.currentTarget.blur(); }}>
      <span><Icon name="cursor"/> {state.open ? commandPageTitle[state.page] : 'Commands'}</span><kbd>{hint}</kbd>
    </button>
    <span className="command-live-note">Combat continues while choosing</span>
    {state.open && <div id="battle-commands" className="command-popover" ref={panel} tabIndex={-1}>
      <div className="command-caption"><span>{actorName} · {commandPageTitle[state.page]}</span>
        <button data-command-native="true" onClick={() => onInput('back')} aria-label={state.page === 'root' ? 'Close command menu' : 'Back one command level'}><Icon name={state.page === 'root' ? 'close' : 'arrowBack'}/></button>
      </div>
      <div role="menu" aria-label={commandPageTitle[state.page]}>
        {rows.map((row, index) => <button key={row.id} role="menuitem" aria-current={index === state.index ? 'true' : undefined}
          aria-disabled={row.disabled || disabled} tabIndex={index === state.index ? 0 : -1}
          className={`command-row ${index === state.index ? 'is-current' : ''}`} title={row.detail}
          onFocus={() => { if (index !== state.index) onHighlight(index); }} onClick={() => { if (!disabled) onChoose(index); }}>
          <span aria-hidden="true" className="command-cursor"><Icon name="cursor"/></span><span>{row.label}</span><span className="command-row-tail" aria-hidden="true">{row.page ? <Icon name="chevron"/> : row.disabled ? '—' : ''}</span>
        </button>)}
      </div>
      <p className="command-detail" role="status">{selected?.detail ?? 'No commands in this category for this role.'}</p>
      <p className="command-nav-hint">↑↓ / D-pad · Enter / A select · Esc / B back</p>
    </div>}
  </div>;
}
