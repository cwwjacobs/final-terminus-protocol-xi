'use client';
import { useCallback, useEffect, useState } from 'react';
import { normalizeLayout, usesTouchLayout, type ControlLayout, type InputMode } from './touch-input';

const STORAGE = 'terminus-xi-control-layout';

export function useInputProfile() {
  const [layout, setLayout] = useState<ControlLayout>('auto');
  const [detected, setDetected] = useState<InputMode>('keyboard');
  const activate = useCallback((mode: InputMode) => setDetected(current => current === mode ? current : mode), []);
  useEffect(() => {
    try { setLayout(normalizeLayout(localStorage.getItem(STORAGE))); } catch {}
    const primaryTouch = window.matchMedia('(pointer: coarse)');
    if (primaryTouch.matches) activate('touch');
    const changed = () => activate(primaryTouch.matches ? 'touch' : 'keyboard');
    const pointer = (event: PointerEvent) => activate(event.pointerType === 'touch' || event.pointerType === 'pen' ? 'touch' : 'keyboard');
    const key = (event: KeyboardEvent) => { if (!event.metaKey && !event.ctrlKey && !event.altKey) activate('keyboard'); };
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keydown', key, true);
    primaryTouch.addEventListener('change', changed);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('keydown', key, true);
      primaryTouch.removeEventListener('change', changed);
    };
  }, [activate]);
  const changeLayout = (next: ControlLayout) => {
    setLayout(next);
    try { localStorage.setItem(STORAGE, next); } catch {}
  };
  return { layout, changeLayout, detected, activate, touch: usesTouchLayout(layout, detected) };
}
