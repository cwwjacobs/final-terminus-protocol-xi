'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { GameState, Mode } from '../../game/types.ts';
import { ROLES } from '../../game/content.ts';
import Icon from './Icon';
import { roleIcon } from './icons';
import { trapDialogTab } from './dialog-navigation';
import './main-menu.css';

export type MainMenuView = 'home' | 'solo' | 'host' | 'join' | 'lobby';
export interface MainMenuMember { slot: number; connected: boolean; reserved: boolean }
export interface MainMenuProps {
  view: MainMenuView;
  state: GameState;
  slot: number;
  mode: Mode;
  roomCode?: string;
  hostSlot?: number | null;
  members?: MainMenuMember[];
  busy: boolean;
  error?: string;
  inviteInput: string;
  canResume: boolean;
  canReconnect?: boolean;
  footer?: ReactNode;
  onView: (view: MainMenuView) => void;
  onMode: (mode: Mode) => void;
  onSlot: (slot: number) => void;
  onSolo: () => void;
  onHost: () => void;
  onJoin: () => void;
  onInviteInput: (value: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onResume: () => void;
  onReconnect?: () => void;
  onSettings: () => void;
  onControls: () => void;
  onGuide: () => void;
}

const titles: Record<MainMenuView, string> = {
  home: 'TERMINUS XI', solo: 'Solo expedition', host: 'Host a party', join: 'Join a party', lobby: 'Party lobby',
};

export default function MainMenu(props: MainMenuProps) {
  const { view, state, slot, mode, roomCode, hostSlot, members, busy, error, inviteInput, canResume, canReconnect, footer } = props;
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }); }, [view]);
  const connected = members ? members.filter(member => member.connected).length : state.party.filter(actor => actor.human).length;
  const isHost = hostSlot !== null && hostSlot !== undefined && hostSlot === slot;
  const chooseMode = <fieldset className="main-menu-modes"><legend>Encounter</legend>
    <button type="button" disabled={busy} aria-pressed={mode === 'trial'} onClick={() => props.onMode('trial')}>
      <span>Resonance trial</span><small>Forgiving encounter</small>
    </button>
    <button type="button" disabled={busy} aria-pressed={mode === 'god'} onClick={() => props.onMode('god')}>
      <span>God encounter</span><small>7:30 collapse deadline</small>
    </button>
  </fieldset>;
  return <div className="main-menu-stage">
    <section ref={panel} className={`main-menu-panel main-menu-${view}`} role="dialog" aria-modal="true" aria-labelledby="main-menu-title" onKeyDown={trapDialogTab}>
      <header className="main-menu-heading">
        <div className="main-menu-navigation">
          {view !== 'home' && view !== 'lobby' ? <button type="button" disabled={busy} onClick={() => props.onView('home')}><Icon name="arrowBack"/> Back</button>
            : <span className="main-menu-eyebrow">{view === 'home' ? 'THE Q PROTOCOL' : 'ONLINE EXPEDITION'}</span>}
          {view === 'lobby' && <button type="button" className="main-menu-leave" disabled={busy} onClick={props.onLeave}>Leave party <Icon name="close"/></button>}
        </div>
        <div className="main-menu-title-row">{view === 'home' && <Icon name="sigil"/>}<h1 id="main-menu-title">{titles[view]}</h1></div>
        <p>{view === 'home' ? 'Memory fades. Power remains.' : view === 'lobby' ? `${connected} / 5 players · trusts fill open places` : 'Choose your next encounter.'}</p>
      </header>

      <div className="main-menu-content">
        {error && <p className="main-menu-error" role="alert">{error}</p>}
        {view === 'home' && <div className="main-menu-choices">
          {canResume && <button type="button" className="primary" data-autofocus disabled={busy} onClick={props.onResume}>Resume encounter <Icon name="arrow"/></button>}
          <button type="button" className={canResume ? '' : 'primary'} data-autofocus={!canResume || undefined} disabled={busy} onClick={() => props.onView('solo')}><span>Play solo<small>You and four trusts</small></span><Icon name="arrow"/></button>
          <div className="main-menu-online-choices">
            <button type="button" disabled={busy} onClick={() => props.onView('host')}><Icon name="party"/><span>Host a party<small>1–5 players</small></span></button>
            <button type="button" disabled={busy} onClick={() => props.onView('join')}><Icon name="arrowOut"/><span>Join a party<small>Invite code or link</small></span></button>
          </div>
          {canReconnect && props.onReconnect && <button type="button" className="main-menu-reconnect" disabled={busy} onClick={props.onReconnect}>{busy ? 'Reconnecting…' : 'Reconnect saved party'}</button>}
        </div>}

        {view === 'solo' && <>
          {chooseMode}
          <fieldset className="main-menu-heroes"><legend>Your character</legend>
            {state.party.map((actor, index) => <button type="button" key={actor.id} data-autofocus={index === slot || undefined} disabled={busy} aria-pressed={index === slot} onClick={() => props.onSlot(index)} title={ROLES[actor.role].description}>
              <span className="main-menu-hero-sigil" style={{ color: actor.color }}><Icon name={roleIcon(actor.role)}/></span>
              <span>{actor.name}<small>{actor.role}</small></span><span className="main-menu-selection" aria-hidden="true">{index === slot ? '●' : ''}</span>
            </button>)}
          </fieldset>
          <p className="main-menu-note">The other four characters fight alongside you as trusts.</p>
        </>}

        {view === 'host' && <>
          {chooseMode}
          <p className="main-menu-explanation">Create a room, copy its invite, and start when your party is ready. Play with 1–5 people; trusts cover every open place.</p>
        </>}

        {view === 'join' && <form id="main-menu-join-form" onSubmit={event => { event.preventDefault(); if (!busy && inviteInput.trim()) props.onJoin(); }}>
          <label className="main-menu-invite-label" htmlFor="main-menu-invite">Invite code or link</label>
          <input data-autofocus id="main-menu-invite" className="main-menu-invite-input" value={inviteInput} disabled={busy} onChange={event => props.onInviteInput(event.target.value)} placeholder="Paste your party invite" maxLength={2048} autoComplete="off" autoCapitalize="none" spellCheck={false}/>
          <p className="main-menu-note">Paste the code or the full invite link shared by your host.</p>
        </form>}

        {view === 'lobby' && <>
          <div className="main-menu-room-invite">
            <label htmlFor="main-menu-room-code">Party invite code</label>
            <input id="main-menu-room-code" data-autofocus={!isHost || undefined} readOnly value={roomCode ?? ''} aria-label="Party invite code" onFocus={event => event.currentTarget.select()} placeholder="Connecting…"/>
            <div><button type="button" disabled={!roomCode || busy} onClick={props.onCopyCode}>Copy code</button><button type="button" disabled={!roomCode || busy} onClick={props.onCopyLink}>Copy invite link</button></div>
          </div>
          <ul className="main-menu-party" aria-label="Five party places">
            {state.party.map((actor, index) => {
              const member = members?.find(item => item.slot === index);
              const occupied = member ? member.connected : actor.human;
              const reserved = !!member?.reserved && !occupied;
              return <li key={actor.id}>
                <span className="main-menu-party-sigil" style={{ color: actor.color }}><Icon name={roleIcon(actor.role)}/></span>
                <span className="main-menu-party-name">{actor.name}<small>{actor.role}</small></span>
                <span className="main-menu-party-status">{index === slot ? 'YOU' : occupied ? 'PLAYER' : reserved ? 'RECONNECTING' : 'TRUST'}{hostSlot === index && <small>HOST</small>}</span>
              </li>;
            })}
          </ul>
          <p className="main-menu-note">{state.mode === 'god' ? 'God encounter · 7:30 collapse deadline' : 'Resonance trial · no deadline'}. {isHost ? 'You can start with any number of players.' : 'Your host starts the encounter.'}</p>
        </>}
      </div>

      <footer className="main-menu-footer">
        {view === 'solo' && <button type="button" className="primary main-menu-launch" disabled={busy} onClick={props.onSolo}>Start solo encounter <Icon name="arrow"/></button>}
        {view === 'host' && <button type="button" data-autofocus className="primary main-menu-launch" disabled={busy} onClick={props.onHost}>{busy ? 'Creating room…' : 'Create party room'}<Icon name="arrow"/></button>}
        {view === 'join' && <button type="submit" form="main-menu-join-form" className="primary main-menu-launch" disabled={busy || !inviteInput.trim()}>{busy ? 'Joining…' : 'Join party'}<Icon name="arrow"/></button>}
        {view === 'lobby' && (isHost ? <button type="button" data-autofocus className="primary main-menu-launch" disabled={busy} onClick={props.onStart}>{busy ? 'Preparing…' : state.status==='victory'||state.status==='defeat' ? 'Prepare next run' : 'Start encounter'}<Icon name="arrow"/></button>
          : <p className="main-menu-waiting" role="status">Waiting for the host to start…</p>)}
        {view === 'home' && <nav className="main-menu-links" aria-label="Game options"><button type="button" onClick={props.onControls}>Controls</button><button type="button" onClick={props.onSettings}>Settings</button><button type="button" onClick={props.onGuide}>How to play</button></nav>}
        {footer && <div className="main-menu-extra">{footer}</div>}
      </footer>
    </section>
  </div>;
}
