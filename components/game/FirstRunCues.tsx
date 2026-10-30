'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '../../game/types';
import type { ControlSettings } from './control-settings';
import { firstRunCue, restoredCueProgress, type FirstRunCueId } from './first-run-cues';
import './first-run-cues.css';

const STORAGE = 'terminus-xi-first-run-cues-v1';

export default function FirstRunCues({ state, slot, controls, layout, active, onDismiss }: {
  state: GameState; slot: number; controls: ControlSettings; layout: 'desktop' | 'controller' | 'touch'; active: boolean; onDismiss: () => void;
}) {
  const [completed, setCompleted] = useState<FirstRunCueId[] | null>(null);
  const previous = useRef<FirstRunCueId | null>(null);
  // Browser-only progress is loaded before presenting or saving any cue.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setCompleted(restoredCueProgress(JSON.parse(localStorage.getItem(STORAGE) || 'null'))); } catch { setCompleted([]); } }, []);
  const complete = useCallback((id: FirstRunCueId) => setCompleted(current => current === null || current.includes(id) ? current : [...current, id]), []);
  useEffect(() => { if (completed !== null) try { localStorage.setItem(STORAGE, JSON.stringify(completed)); } catch {} }, [completed]);
  const cue = active && completed ? firstRunCue(state, slot, controls, layout, completed) : null;
  const cueId = cue?.id ?? null;
  useEffect(() => {
    // Successfully acting or leaving the context retires a shown cue as well.
    if (previous.current && previous.current !== cueId) complete(previous.current);
    previous.current = cueId;
    if (!cueId) return;
    const timeout = setTimeout(() => complete(cueId), 12000);
    return () => clearTimeout(timeout);
  }, [cueId, complete]);
  if (!cue) return null;
  return <aside className="first-run-cue" aria-label="Field tip">
    <div role="status" aria-live="polite"><strong>{cue.title}</strong><p>{cue.text}</p></div>
    <button aria-label={`Dismiss tip: ${cue.title}`} onClick={() => { complete(cue.id); onDismiss(); }}>Got it</button>
  </aside>;
}
