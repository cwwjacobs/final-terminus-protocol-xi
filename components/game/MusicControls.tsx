'use client';
import { MUSIC_TITLE } from './music-settings.ts';
import type { GameMusic } from './use-game-music.ts';

/** The parent chooses placement; this controls the single shared audio node. */
export default function MusicControls({ music, compact = false }: { music: GameMusic; compact?: boolean }) {
  const active = music.enabled && (music.playing || music.status === 'loading');
  return <section className={`music-controls${compact ? ' compact' : ''}`} aria-label="Music controls">
    <div className="music-heading"><span>Music</span>{!compact && <small>{MUSIC_TITLE}</small>}</div>
    <div className="music-actions">
      <button type="button" onClick={music.toggleMusic} aria-label={active ? 'Pause music' : 'Play music'}>
        {active ? 'Pause music' : 'Play music'}
      </button>
      <button type="button" onClick={() => music.setMuted(!music.muted)} aria-pressed={music.muted} aria-label={music.muted ? 'Unmute music' : 'Mute music'}>
        {music.muted ? 'Unmute' : 'Mute'}
      </button>
      {!compact && <label className="music-volume">Volume <input type="range" aria-label="Music volume" min="0" max="100" step="5"
        value={Math.round(music.volume * 100)} onChange={event => music.setVolume(Number(event.target.value) / 100)}/><output>{Math.round(music.volume * 100)}%</output></label>}
    </div>
    {music.status === 'loading' && <small role="status">Loading music…</small>}
    {music.error && <div className="music-error" role="status"><small>{music.error}</small>{music.status === 'error' && <button type="button" onClick={music.retryMusic}>Retry music</button>}</div>}
  </section>;
}
