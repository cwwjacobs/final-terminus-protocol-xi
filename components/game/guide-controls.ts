import type { Actor } from '../../game/types.ts';
import { effectiveBindingCommand, keyLabel, buttonLabel, type Command, type ControlSettings } from './control-settings.ts';
import { roleActionSlots } from './kit-ui.ts';

export type GuideActor = Pick<Actor, 'name' | 'role' | 'sonOfZeus'>;

/** Resolve the same role slots as input and the HUD, including saved overrides. */
export function guideBinding(actor: GuideActor, command: Command, controls: ControlSettings, mode: 'keyboard' | 'controller'): string {
  const binding = effectiveBindingCommand(actor.role, command, controls, mode, actor.sonOfZeus);
  if (!binding) return 'Unbound';
  return mode === 'keyboard' ? keyLabel(controls.keys[binding]) : buttonLabel(controls.buttons[binding]!);
}

export function guideAbilities(actor: GuideActor, controls: ControlSettings, mode: 'keyboard' | 'controller') {
  return roleActionSlots(actor.role, null, actor).map(slot => ({
    command: slot.command,
    name: slot.command === 'engage' ? 'Engage / disengage' : slot.presentation.name,
    binding: guideBinding(actor, slot.command, controls, mode),
  }));
}
