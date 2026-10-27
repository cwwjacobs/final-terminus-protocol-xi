'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { GameState, Mode } from '../../game/types.ts';
import { PARTY } from '../../game/content.ts';
import Icon from './Icon';
import { roleIcon } from './icons';
import HeroPicker from './HeroPicker';
import { trapDialogTab } from './dialog-navigation';
import './main-menu.css';

export type MainMenuView = 'splash' | 'home' | 'heroes' | 'solo' | 'host' | 'join' | 'lobby' | 'loading';
export interface MainMenuMember { slot: number; connected: boolean; reserved: boolean; loaded?: boolean }
export interface MainMenuProps {
  view: MainMenuView;
  state: GameState;
  slot: number;
  selectedHeroSlot: number;
  controlLabel?: string;
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
  onRoomHero?: (slot: number) => void;
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
  onRetryLoad: () => void;
  onLightLoad: () => void;
  loading?: { ready: boolean; loaded: number; total: number; error?: string };
}

const titles: Record<MainMenuView, string> = {
  splash: 'TERMINUS PROTOCOL', home: 'TERMINUS PROTOCOL', loading: 'TERMINUS PROTOCOL', heroes: 'Choose your hero', solo: 'Solo expedition', host: 'Host a party', join: 'Join a party', lobby: 'Party lobby',
};

export default function MainMenu(props: MainMenuProps) {
  const { view, state, slot, selectedHeroSlot, controlLabel, mode, roomCode, hostSlot, members, busy, error, inviteInput, canResume, canReconnect, footer } = props;
  const selectedHero = PARTY[selectedHeroSlot] ?? PARTY[0];
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [view]);
  useEffect(() => { panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }); }, [view, busy]);
  useEffect(() => { if (props.loading?.error) panel.current?.querySelector<HTMLElement>('.battlefield-recovery button')?.focus(); }, [props.loading?.error]);
  const connected = members ? members.filter(member => member.connected).length : state.party.filter(actor => actor.human).length;
  const isHost = hostSlot !== null && hostSlot !== undefined && hostSlot === slot;
  const partyLoading = !props.loading?.ready || members?.some(member => member.connected && member.loaded === false);
  if (view === 'splash') return <div className="main-menu-stage" data-view="splash">
    <img className="start-screen-art" src="/assets/title/logos-ascension.webp" alt="Zeus strikes the crowned Logos as the five heroes escape through a storm of shattered stone." fetchPriority="high" width="1672" height="941"/>
    <section className="main-menu-splash" role="dialog" aria-modal="true" aria-labelledby="start-screen-title" ref={panel} onKeyDown={trapDialogTab}>
      <h1 id="start-screen-title" className="screen-reader-only">TERMINUS PROTOCOL — LOGOS ASCENSION</h1>
      <button type="button" className="start-screen-enter primary" data-autofocus disabled={busy} onClick={()=>props.onView('home')}>Enter <span>The Q Protocol</span><Icon name="arrow"/></button>
      {footer && <div className="start-screen-music">{footer}</div>}
    </section>
  </div>;
  const chooseMode = <fieldset className="main-menu-modes"><legend>Encounter</legend>
    <button type="button" disabled={busy} aria-pressed={mode === 'trial'} onClick={() => props.onMode('trial')}>
      <span>Resonance trial</span><small>Forgiving encounter</small>
    </button>
    <button type="button" disabled={busy} aria-pressed={mode === 'god'} onClick={() => props.onMode('god')}>
      <span>God encounter</span><small>7:30 collapse deadline</small>
    </button>
  </fieldset>;
  return <div className="main-menu-stage" data-view={view} data-outside={view !== 'lobby' && view !== 'loading'}>
    {view !== 'lobby' && view !== 'loading' && <img className="start-screen-art" src="/assets/title/logos-ascension.webp" alt="" width="1672" height="941"/>}
    <section ref={panel} className={`main-menu-panel main-menu-${view}`} role="dialog" aria-modal="true" aria-labelledby="main-menu-title" onKeyDown={trapDialogTab}>
      <header className="main-menu-heading">
        <div className="main-menu-navigation">
          {view !== 'home' && view !== 'lobby' ? <button type="button" disabled={busy} onClick={() => view==='loading'&&roomCode ? props.onLeave() : props.onView('home')}><Icon name="arrowBack"/> {view==='loading'&&roomCode?'Leave party':'Back'}</button>
            : <span className="main-menu-eyebrow">THE Q PROTOCOL{view === 'lobby' ? ' · PARTY ASSEMBLY' : ''}</span>}
          {view === 'lobby' && <button type="button" className="main-menu-leave" disabled={busy} onClick={props.onLeave}>Leave party <Icon name="close"/></button>}
        </div>
        <div className="main-menu-title-row">{view === 'home' && <img className="main-menu-crest" src="/assets/vfx/stormlight-crest.svg" width="44" height="44" alt=""/>}<h1 id="main-menu-title">{titles[view]}{(view === 'home'||view === 'loading')&&<small className="main-menu-subtitle">LOGOS ASCENSION</small>}</h1></div>
        <p>{view === 'home' ? 'Memory fades. Power remains.' : view === 'loading' ? 'Preparing the Quantum Realm.' : view === 'lobby' ? `${connected} / 5 players · trusts fill open places` : view === 'heroes' ? 'Five heroes. One place in the party is yours.' : 'Choose your next encounter.'}</p>
      </header>

      <div className="main-menu-content">
        {error && <p className="main-menu-error" role="alert">{error}</p>}
        {(view === 'loading'||view === 'lobby') && <div className="battlefield-loading" role="status" aria-live="polite">
          <span>{props.loading?.error ? 'Battlefield unavailable' : props.loading?.ready ? 'Battlefield ready' : 'Loading the battlefield…'}</span>
          <progress max={Math.max(1,props.loading?.total ?? 5)} value={props.loading?.ready ? Math.max(1,props.loading.total) : props.loading?.loaded ?? 0} aria-label="Battlefield loading"/>
          <small>{props.loading?.error ?? (props.loading?.ready ? 'Your heroes and arena are ready.' : `${props.loading?.loaded ?? 0} / ${props.loading?.total ?? 5} heroes · preparing shaders`)}</small>
        </div>}
        {(view === 'loading'||view === 'lobby') && !props.loading?.ready && <div className="battlefield-recovery">
          <p>{props.loading?.error ? 'Your run is kept. Choose a recovery option below.' : 'Slow connection or older phone? Basic hero models need less memory and no model downloads.'}</p>
          <div><button type="button" onClick={props.onLightLoad} disabled={busy}>Use lighter 3D</button>{props.loading?.error && <button type="button" onClick={props.onRetryLoad} disabled={busy}>Retry loading</button>}</div>
        </div>}
        {view === 'loading' && <><ul className="main-menu-party" aria-label="Your expedition">{state.party.map((actor,index)=><li key={actor.id}><span className="main-menu-party-sigil" style={{color:actor.color}}><Icon name={roleIcon(actor.role)}/></span><span className="main-menu-party-name">{actor.name}<small>{actor.role}</small></span><span className="main-menu-party-status">{index===slot?'YOU':'TRUST'}</span></li>)}</ul><p className="main-menu-note">The encounter begins when the battlefield finishes loading.</p></>}
        {view === 'home' && <div className="main-menu-choices">
          {canResume && <button type="button" className="primary" data-autofocus disabled={busy} onClick={props.onResume}><span>Resume encounter<small>Continue as {state.party[slot]?.name ?? selectedHero.name}</small></span><Icon name="arrow"/></button>}
          <button type="button" className={canResume ? '' : 'primary'} data-autofocus={!canResume || undefined} disabled={busy} onClick={() => props.onView('solo')}><span>Play solo<small>You and four trusts</small></span><Icon name="arrow"/></button>
          <button type="button" className="main-menu-choose-hero" disabled={busy} onClick={() => props.onView('heroes')}><span className="main-menu-chosen-sigil" style={{ color: selectedHero.color }}><Icon name={roleIcon(selectedHero.role)}/></span><span>Choose hero<small>{selectedHero.name} · <span className="main-menu-role">{selectedHero.role}</span></small></span><Icon name="arrow"/></button>
          <div className="main-menu-online-choices">
            <button type="button" disabled={busy} onClick={() => props.onView('host')}><Icon name="party"/><span>Host a party<small>1–5 players</small></span></button>
            <button type="button" disabled={busy} onClick={() => props.onView('join')}><Icon name="arrowOut"/><span>Join a party<small>Invite code or link</small></span></button>
          </div>
          {canReconnect && props.onReconnect && <button type="button" className="main-menu-reconnect" disabled={busy} onClick={props.onReconnect}>{busy ? 'Reconnecting…' : 'Reconnect saved party'}</button>}
        </div>}

        {view === 'heroes' && <>
          <HeroPicker selectedSlot={selectedHeroSlot} onSelect={props.onSlot} busy={busy} autoFocus/>
          <p className="main-menu-note">Your choice is saved for solo play and new parties. Each party has one of each hero.</p>
        </>}

        {view === 'solo' && <>
          {chooseMode}
          <h2 className="main-menu-section-title">Your hero</h2>
          <HeroPicker selectedSlot={selectedHeroSlot} onSelect={props.onSlot} busy={busy} autoFocus/>
          <p className="main-menu-note">The other four characters fight alongside you as trusts.</p>
        </>}

        {view === 'host' && <>
          {chooseMode}
          <h2 className="main-menu-section-title">Your hero</h2>
          <HeroPicker selectedSlot={selectedHeroSlot} onSelect={props.onSlot} busy={busy}/>
          <p className="main-menu-explanation">Create a room, copy its invite, and start when your party is ready. Play with 1–5 people; trusts cover every open place.</p>
        </>}

        {view === 'join' && <form id="main-menu-join-form" onSubmit={event => { event.preventDefault(); if (!busy && inviteInput.trim()) props.onJoin(); }}>
          <label className="main-menu-invite-label" htmlFor="main-menu-invite">Invite code or link</label>
          <input data-autofocus id="main-menu-invite" className="main-menu-invite-input" value={inviteInput} disabled={busy} onChange={event => props.onInviteInput(event.target.value)} placeholder="Paste your party invite" maxLength={2048} autoComplete="off" autoCapitalize="none" spellCheck={false}/>
          <p className="main-menu-note">Paste the code or the full invite link shared by your host.</p>
          <details className="main-menu-hero-details">
            <summary>Preferred hero <span>{selectedHero.name} · <span className="main-menu-role">{selectedHero.role}</span></span></summary>
            <HeroPicker selectedSlot={selectedHeroSlot} onSelect={props.onSlot} busy={busy}/>
          </details>
          <p className="main-menu-note">If {selectedHero.name} is taken, you’ll join as an available hero. You can choose another open hero in the lobby.</p>
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
                <span className="main-menu-party-status">{index === slot ? 'YOU' : occupied ? 'PLAYER' : reserved ? 'RECONNECTING' : 'TRUST'}{occupied&&<small>{member?.loaded===false?'LOADING':'READY'}</small>}{hostSlot === index && <small>HOST</small>}</span>
              </li>;
            })}
          </ul>
          {state.status === 'ready' && props.onRoomHero ? <details className="main-menu-hero-details">
            <summary>Choose hero <span>{state.party[slot]?.name ?? selectedHero.name}</span></summary>
            <HeroPicker selectedSlot={slot} ownSlot={slot} members={members ?? state.party.map((actor, index) => ({ slot: index, connected: actor.human, reserved: false }))} lobby busy={busy} onSelect={props.onRoomHero}/>
            <p className="main-menu-note">One player per hero. Trust places are available; reconnecting players keep their places.</p>
          </details> : <p className="main-menu-note">{isHost ? 'Prepare the next run to change heroes.' : 'Your host must prepare the next run before heroes can change.'}</p>}
          <p className="main-menu-note">{state.mode === 'god' ? 'God encounter · 7:30 collapse deadline' : 'Resonance trial · no deadline'}. {isHost ? 'You can start with any number of players.' : 'Your host starts the encounter.'}</p>
        </>}
      </div>

      <footer className="main-menu-footer" data-launch={['heroes','solo','host','join','lobby'].includes(view)}>
        {view === 'heroes' && <button type="button" className="primary main-menu-launch" disabled={busy} onClick={() => props.onView('home')}>Continue as {selectedHero.name}<Icon name="arrow"/></button>}
        {view === 'solo' && <button type="button" className="primary main-menu-launch" disabled={busy} onClick={props.onSolo}>Start solo encounter <Icon name="arrow"/></button>}
        {view === 'host' && <button type="button" data-autofocus className="primary main-menu-launch" disabled={busy} onClick={props.onHost}>{busy ? 'Creating room…' : 'Create party room'}<Icon name="arrow"/></button>}
        {view === 'join' && <button type="submit" form="main-menu-join-form" className="primary main-menu-launch" disabled={busy || !inviteInput.trim()}>{busy ? 'Joining…' : 'Join party'}<Icon name="arrow"/></button>}
        {view === 'lobby' && (isHost ? <button type="button" data-autofocus className="primary main-menu-launch" disabled={busy||partyLoading&&state.status==='ready'} onClick={props.onStart}>{busy ? 'Preparing…' : state.status==='victory'||state.status==='defeat' ? 'Prepare next run' : partyLoading ? 'Waiting for players to load…' : 'Start encounter'}<Icon name="arrow"/></button>
          : <p className="main-menu-waiting" role="status">Waiting for the host to start…</p>)}
        {view === 'home' && <>
          <button type="button" className="main-menu-controls" disabled={busy} onClick={props.onControls}><span>Controls &amp; keybinds{controlLabel && <small>{controlLabel}</small>}</span><Icon name="arrow"/></button>
          <nav className="main-menu-links" aria-label="Game options"><button type="button" onClick={props.onSettings}>Settings</button><button type="button" onClick={props.onGuide}>How to play</button></nav>
          <button type="button" className="main-menu-view-art" onClick={()=>props.onView('splash')}>View title artwork</button>
        </>}
        {(view === 'loading'||view === 'lobby')&&<nav className="main-menu-links" aria-label="Waiting screen options"><button type="button" onClick={props.onSettings}>Settings</button><button type="button" onClick={props.onControls}>Controls</button></nav>}
        {footer && <div className="main-menu-extra">{footer}</div>}
      </footer>
    </section>
  </div>;
}
