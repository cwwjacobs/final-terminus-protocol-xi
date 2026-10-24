'use client';
import { useEffect, useRef, useState } from 'react';
import { PARTY } from '../../game/content';
import type { Role } from '../../game/types';
import { COMMANDS, bindButton, bindKey, buttonLabel, defaults, effectiveBindingCommand, keyboardEventBinding, keyLabel, type Command, type ControlSettings } from './control-settings';
import { roleActionSlots } from './kit-ui';
import Icon from './Icon';
import './controls-panel.css';

interface Props {
  value: ControlSettings;
  onChange: (value: ControlSettings) => void;
  onRecenter: () => void;
  role?: Role;
  inputLayout?: 'desktop' | 'controller' | 'touch';
}
type BindingDevice = 'keyboard' | 'controller' | 'touch';
const slotDescriptions: Partial<Record<Command, string>> = {
  primary1: 'Primary 1', primary2: 'Primary 2', primary3: 'Primary 3',
  utility1: 'Role technique', utility2: 'Role support',
};
const targetingLabels: Partial<Record<Command, string>> = {
  targetNext: 'Next enemy · alternate', targetPrevious: 'Previous enemy · alternate',
};

export default function ControlsPanel({ value, onChange, onRecenter, role = 'vanguard', inputLayout = 'desktop' }: Props) {
  const [device, setDevice] = useState<BindingDevice>(inputLayout === 'desktop' ? 'keyboard' : inputLayout);
  const [capturing, setCapturing] = useState<{ command: Command; label: string } | null>(null);
  const [notice, setNotice] = useState('Changes save automatically on this device.');
  const captureButton = useRef<HTMLButtonElement | null>(null);
  const hero = PARTY.find(member => member.role === role)!;
  const combat = roleActionSlots(role);
  const bindingMode = device === 'controller' ? 'controller' : 'keyboard';
  const unbound = combat.filter(slot => !effectiveBindingCommand(role, slot.command, value, bindingMode));

  useEffect(() => {
    if (!capturing) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') { setCapturing(null); setNotice('Binding unchanged.'); captureButton.current?.focus(); return; }
      if (/^(Shift|Control|Alt|Meta)/.test(event.code)) return;
      const key = keyboardEventBinding(event);
      if (!key) { setNotice('Choose a gameplay key. Escape cancels; browser shortcuts are reserved.'); return; }
      onChange(bindKey(value, capturing.command, key));
      setNotice(`${capturing.label} bound to ${keyLabel(key)}. Conflicting bindings are swapped or cleared.`);
      setCapturing(null); captureButton.current?.focus();
    };
    const release = (event: KeyboardEvent) => {
      if (!['ShiftLeft', 'ShiftRight'].includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      onChange(bindKey(value, capturing.command, event.code));
      setCapturing(null); setNotice(`${capturing.label} bound to ${keyLabel(event.code)}; modifier-only keys activate on release.`);
      captureButton.current?.focus();
    };
    window.addEventListener('keydown', capture, true); window.addEventListener('keyup', release, true);
    return () => { window.removeEventListener('keydown', capture, true); window.removeEventListener('keyup', release, true); };
  }, [capturing, onChange, value]);

  const number = (key: 'mouseSensitivity' | 'touchSensitivity' | 'stickSensitivity' | 'zoomSensitivity' | 'cameraHeight' | 'shoulderOffset' | 'defaultDistance', label: string, min: number, max: number, step: number) =>
    <label className="control-range" key={key}>{label}<output>{value[key].toFixed(1)}</output><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={e => onChange({ ...value, [key]: Number(e.target.value) })}/></label>;
  const toggle = (key: 'invertMouseX' | 'invertMouseY' | 'invertPadX' | 'invertPadY' | 'invertMoveX' | 'invertMoveY', label: string) =>
    <label className="checkbox" key={key}><input type="checkbox" checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })}/>{label}</label>;
  const bindingRow = (command: Command, label: string, detail?: string, rowKey = command) => <div className="mapper-row" key={rowKey}>
    <span className="mapper-action">{label}{detail && <small>{detail}</small>}</span>
    {device === 'keyboard' ? <div className="mapper-key-buttons">
      <button type="button" className={capturing?.command === command ? 'listening' : ''} aria-label={`Rebind ${label}`} onClick={e => { captureButton.current = e.currentTarget; setCapturing({ command, label }); setNotice('Press a replacement key, or Escape to cancel.'); }}>{capturing?.command === command ? 'Press a key…' : keyLabel(value.keys[command]) || 'Unbound'}</button>
      <button type="button" className="mapper-unbind" aria-label={`Clear key for ${label}`} title={`Clear key for ${label}`} disabled={!value.keys[command]} onClick={() => { onChange(bindKey(value, command, '')); setNotice(`${label} keyboard binding cleared.`); }}><Icon name="close"/></button>
    </div> : <select aria-label={`Controller button for ${label}`} value={value.buttons[command] ?? ''} onChange={e => {
      onChange(bindButton(value, command, e.target.value === '' ? undefined : Number(e.target.value)));
      setNotice(`${label} controller mapping updated. Conflicting buttons are swapped or cleared.`);
    }}><option value="">Unbound</option>{Array.from({ length: Math.max(17, (value.buttons[command] ?? 0) + 1) }, (_, button) => <option key={button} value={button}>{buttonLabel(button)}</option>)}</select>}
  </div>;

  return <div className="controls-panel">
    <p className="mapper-intro">Select a key, then press its replacement. Escape cancels. For controller bindings, choose a button from the list.</p>
    <div className="mapper-device" role="group" aria-label="Edit bindings for device">
      {(['keyboard', 'controller', 'touch'] as const).map(item => <button type="button" key={item} aria-pressed={device === item} onClick={() => { setCapturing(null); setDevice(item); }}>{item === 'keyboard' ? 'Keyboard' : item === 'controller' ? 'Controller' : 'Touch'}</button>)}
    </div>
    <p className="mapper-device-help">These tabs edit device controls. The layout selector above chooses the game’s on-screen layout.</p>
    <p className="mapper-notice" role="status" aria-live="polite">{capturing ? `Listening for ${capturing.label}… Press Escape to cancel.` : notice}</p>

    {device === 'touch' ? <section className="mapper-touch" aria-label="Touch controls">
      <h3>Touch controls</h3>
      <p>Use the left stick to move and the right-hand buttons for {hero.name}’s abilities. Select an enemy with the target button below its health bar. Tap a party member to select an ally.</p>
      <p>Swipe the battlefield to look around when disengaged. Pinch to zoom. Opening a menu releases held touch controls.</p>
      <div className="mapper-ranges">{number('touchSensitivity', 'Touch look sensitivity', .1, 3, .1)}{number('zoomSensitivity', 'Zoom sensitivity', .1, 3, .1)}</div>
    </section> : <>
      <details className="mapper-section" open><summary>Combat <span>{hero.name} · {hero.role}</span></summary>
        <p className="mapper-hint">Primary and role bindings follow your chosen hero. Unused ability slots are hidden.</p>
        {unbound.length > 0 && <p className="mapper-warning">Unbound for {device}: {unbound.map(slot => slot.presentation.name).join(', ')}.</p>}
        <div className="mapper-column-head" aria-hidden="true"><span>Action</span><span>{device === 'keyboard' ? 'Key' : 'Button'}</span></div>
        {combat.map(slot => {
          const command = effectiveBindingCommand(role, slot.command, value, bindingMode) ?? slot.id;
          return bindingRow(command, slot.id === 'engage' ? 'Engage / disengage' : slot.presentation.name, command === slot.id ? slotDescriptions[slot.id] : 'Custom direct binding', slot.id);
        })}
      </details>
      <details className="mapper-section" open><summary>Targeting</summary>
        <p className="mapper-hint">Up / down selects allies; left / right selects enemies by default. Selecting an ally keeps your enemy lock.</p>
        {COMMANDS.filter(command => command.group === 'Targeting').map(command => bindingRow(command.id, targetingLabels[command.id] ?? command.label))}
      </details>
      <details className="mapper-section"><summary>Movement</summary>
        {device === 'controller' && <p className="mapper-hint">The left stick moves relative to the camera. These optional button mappings add digital movement.</p>}
        {COMMANDS.filter(command => command.group === 'Movement').map(command => bindingRow(command.id, command.label))}
      </details>
      <details className="mapper-section"><summary>Optional direct ability bindings</summary>
        <p className="mapper-hint">Add a second shortcut for a named ability. The Combat section already has every usable ability for {hero.name}.</p>
        {COMMANDS.filter(command => command.group === 'Direct ability overrides' && combat.some(slot => slot.command === command.id)).map(command => bindingRow(command.id, combat.find(slot => slot.command === command.id)!.presentation.name))}
      </details>
      <details className="mapper-section"><summary>Optional command menu</summary>
        <p className="mapper-hint">A second way to choose abilities. Within Commands, arrows / D-pad move, Enter / A selects, and Escape / B goes back.</p>
        {bindingRow('commandMenu', 'Open Commands')}
      </details>
    </>}

    <details className="mapper-section mapper-advanced"><summary>Advanced camera &amp; sensitivity</summary>
      <p className="mapper-hint">Engaging locks the camera onto the enemy. Disengage to look around with a drag, swipe or the right stick. Scroll or pinch to zoom.</p>
      <div className="mapper-ranges">
        {number('mouseSensitivity', 'Mouse look sensitivity', .1, 3, .1)}
        {device !== 'touch' && number('touchSensitivity', 'Touch look sensitivity', .1, 3, .1)}
        {number('stickSensitivity', 'Controller look sensitivity', .1, 3, .1)}
        {device !== 'touch' && number('zoomSensitivity', 'Zoom sensitivity', .1, 3, .1)}
        {number('defaultDistance', 'Camera distance', 4, 24, .5)}
        {number('cameraHeight', 'Camera height', .2, 5, .1)}
        {number('shoulderOffset', 'Camera shoulder offset', -3, 3, .1)}
      </div>
      <button type="button" onClick={onRecenter}>Recenter behind character</button>
      {device !== 'touch' && <div className="mapper-camera-bindings">{COMMANDS.filter(command => command.group === 'Camera').map(command => bindingRow(command.id, command.label))}</div>}
      <h4>Inversion</h4>
      <div className="mapper-inversion">
        {toggle('invertMouseX', 'Invert mouse horizontal')}{toggle('invertMouseY', 'Invert mouse vertical')}
        {toggle('invertPadX', 'Invert right stick horizontal')}{toggle('invertPadY', 'Invert right stick vertical')}
        {toggle('invertMoveX', 'Invert movement left / right')}{toggle('invertMoveY', 'Invert movement forward / back')}
      </div>
    </details>
    <div className="mapper-reset"><button type="button" onClick={() => { setCapturing(null); onChange(defaults()); setNotice('Default bindings, camera settings and non-inverted controls restored.'); }}>Restore all default controls</button><small>Resets bindings, camera settings and inversion.</small></div>
  </div>;
}
