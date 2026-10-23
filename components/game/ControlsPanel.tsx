'use client';
import { useEffect, useRef, useState } from 'react';
import { COMMANDS, bindButton, bindKey, buttonLabel, defaults, keyboardEventBinding, keyLabel, type Command, type ControlSettings } from './control-settings';

interface Props { value: ControlSettings; onChange: (value: ControlSettings) => void; onRecenter: () => void }
export default function ControlsPanel({ value, onChange, onRecenter }: Props) {
  const [capturing, setCapturing] = useState<Command | null>(null);
  const [notice, setNotice] = useState('Changes save automatically on this device.');
  const captureButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!capturing) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') { setCapturing(null); setNotice('Binding unchanged.'); captureButton.current?.focus(); return; }
      if (/^(Shift|Control|Alt|Meta)/.test(event.code)) return;
      const key = keyboardEventBinding(event);
      if (!key) { setNotice('Choose a gameplay key. Escape cancels; browser shortcuts are reserved.'); return; }
      onChange(bindKey(value, capturing, key));
      setNotice(`${COMMANDS.find(c => c.id === capturing)?.label} bound to ${keyLabel(key)}. Conflicting bindings are swapped or cleared.`);
      setCapturing(null); captureButton.current?.focus();
    };
    const release = (event: KeyboardEvent) => { if (!['ShiftLeft','ShiftRight'].includes(event.code)) return; event.preventDefault(); event.stopImmediatePropagation(); onChange(bindKey(value,capturing,event.code)); setCapturing(null); setNotice('Modifier key bound; it activates on release.'); captureButton.current?.focus(); };
    window.addEventListener('keydown', capture, true); window.addEventListener('keyup', release, true);
    return () => { window.removeEventListener('keydown', capture, true); window.removeEventListener('keyup', release, true); };
  }, [capturing, onChange, value]);
  const number = (key: 'mouseSensitivity'|'stickSensitivity'|'zoomSensitivity'|'cameraHeight'|'shoulderOffset'|'defaultDistance', label: string, min: number, max: number, step: number) =>
    <label className="control-range" key={key}>{label}<output>{value[key].toFixed(1)}</output><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={e => onChange({ ...value, [key]: Number(e.target.value) })}/></label>;
  const toggle = (key: 'invertMouseX'|'invertMouseY'|'invertPadX'|'invertPadY'|'invertMoveX'|'invertMoveY', label: string) =>
    <label className="checkbox" key={key}><input type="checkbox" checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })}/>{label}</label>;
  return <div className="controls-panel">
    <p>Engaging automatically locks the camera onto the enemy. Disengage to look around with a battlefield drag or the right stick. Scroll to zoom in either mode. Movement follows the camera.</p>
    <div className="camera-settings">
      {number('mouseSensitivity','Mouse look sensitivity',.1,3,.1)}
      {number('stickSensitivity','Controller look sensitivity',.1,3,.1)}
      {number('zoomSensitivity','Zoom sensitivity',.1,3,.1)}
      {number('defaultDistance','Camera distance',4,24,.5)}
      {number('cameraHeight','Camera height',.2,5,.1)}
      {number('shoulderOffset','Camera shoulder offset',-3,3,.1)}
    </div>
    <button onClick={onRecenter}>Recenter behind character</button>
    <details className="control-options"><summary>Inversion — optional, off by default</summary>
      <div className="inversion-grid">
        {toggle('invertMouseX','Invert mouse horizontal')}{toggle('invertMouseY','Invert mouse vertical')}
        {toggle('invertPadX','Invert right stick horizontal')}{toggle('invertPadY','Invert right stick vertical')}
        {toggle('invertMoveX','Invert movement left / right')}{toggle('invertMoveY','Invert movement forward / back')}
      </div>
    </details>
    <h3>Make the controls yours</h3>
    <p>Choose a key button, then press its replacement. Escape cancels. By default, Tab cycles enemies; Shift + Tab cycles back. A single enemy remains selected and flashes its marker on every press. Menu Tab keeps normal keyboard navigation.</p>
    <p className="binding-notice" role="status">{capturing ? `Listening for ${COMMANDS.find(c => c.id === capturing)?.label}…` : notice}</p>
    {Array.from(new Set(COMMANDS.map(c => c.group))).map(group => <details className="control-options" key={group} open={group === 'Targeting'}><summary>{group}</summary>
      <div className="binding-head" aria-hidden="true"><span>Action</span><span>Keyboard</span><span>Controller</span></div>
      {COMMANDS.filter(c => c.group === group).map(command => <div className="binding-row" key={command.id}>
        <span>{command.label}</span>
        <div className="key-binding"><button className={capturing === command.id ? 'listening' : ''} aria-label={`Rebind ${command.label}`} onClick={e => { captureButton.current = e.currentTarget; setCapturing(command.id); }}>{capturing === command.id ? 'Press a key…' : keyLabel(value.keys[command.id]) || 'Unbound'}</button><button className="unbind" aria-label={`Clear key for ${command.label}`} onClick={() => { onChange(bindKey(value,command.id,'')); setNotice(`${command.label} keyboard binding cleared.`); }}>×</button></div>
        <select aria-label={`Controller button for ${command.label}`} value={value.buttons[command.id] ?? ''} onChange={e => { onChange(bindButton(value,command.id,e.target.value === '' ? undefined : Number(e.target.value))); setNotice('Controller mapping updated; conflicting buttons are swapped or cleared.'); }}><option value="">Unbound</option>{Array.from({length:17},(_,button) => <option key={button} value={button}>{buttonLabel(button)}</option>)}</select>
      </div>)}
    </details>)}
    <p className="muted">Left stick moves; right stick looks. Button mappings above are configurable. Open Commands is remappable (Enter / A by default). Within Commands, arrows / D-pad navigate, Enter / A selects, and Escape / B goes back; these navigation controls are fixed. Combat continues while you choose. Settings dialogs keep normal keyboard and Tab navigation. Keyboard modifier-only combat keys, such as Shift for Guard, activate on release so Shift + Tab can target safely.</p>
    <button onClick={() => { setCapturing(null); onChange(defaults()); setNotice('Default bindings, camera settings and non-inverted controls restored.'); }}>Restore default controls</button>
  </div>;
}
