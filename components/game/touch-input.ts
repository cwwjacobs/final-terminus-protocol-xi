export interface TouchStickState { pointerId: number | null; x: number; z: number }

export const createTouchStick = (): TouchStickState => ({ pointerId: null, x: 0, z: 0 });
export function resetTouchStick(stick: TouchStickState) {
  stick.pointerId = null; stick.x = 0; stick.z = 0;
}

/** Radial deadzone, circular travel and camera-forward up. Invalid input stops. */
export function touchAxes(dx: number, dy: number, radius: number) {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { x: 0, z: 0 };
  const distance = Math.hypot(dx, dy), travel = Math.min(1, distance / radius);
  const strength = Math.max(0, (travel - .12) / .88);
  return distance ? { x: dx / distance * strength, z: -dy / distance * strength } : { x: 0, z: 0 };
}

export type InputMode = 'keyboard' | 'touch' | 'controller';
export type ControlLayout = 'auto' | 'touch' | 'desktop';
export const normalizeLayout = (value: unknown): ControlLayout => value === 'touch' || value === 'desktop' ? value : 'auto';
export const usesTouchLayout = (layout: ControlLayout, detected: InputMode) => layout === 'touch' || (layout === 'auto' && detected === 'touch');
