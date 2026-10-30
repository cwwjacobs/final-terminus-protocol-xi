import type { ControlSettings, Command } from './control-settings';
import { guideAbilities, guideBinding, type GuideActor } from './guide-controls';

export default function GuideControls({ actor, controls }: { actor: GuideActor; controls: ControlSettings }) {
  const keyboard = (command: Command) => guideBinding(actor, command, controls, 'keyboard');
  const controller = (command: Command) => guideBinding(actor, command, controls, 'controller');
  return <>
    <h3>{actor.name}{actor.sonOfZeus ? ' · Son of Zeus' : ''} · current controls</h3>
    <div className="control-grid">
      <p><b>Touchscreen</b><br/>Left thumbstick moves · swipe field to look.<br/>Pinch the field to zoom; camera buttons are in Menu.<br/>Tap the named abilities while moving.<br/>Controls & camera can override automatic layout.</p>
      <div><p><b>Keyboard / mouse</b><br/>{keyboard('forward')} / {keyboard('left')} / {keyboard('backward')} / {keyboard('right')} move · drag to look<br/>{keyboard('targetAllyPrevious')} / {keyboard('targetAllyNext')} allies<br/>{keyboard('targetEnemyPrevious')} / {keyboard('targetEnemyNext')} enemies · scroll to zoom<br/>{keyboard('cameraUp')} / {keyboard('cameraLeft')} / {keyboard('cameraDown')} / {keyboard('cameraRight')} camera<br/>{keyboard('recenter')} recenter</p>
        {guideAbilities(actor, controls, 'keyboard').map(ability => <p key={ability.command}><kbd>{ability.binding}</kbd> {ability.name}</p>)}
        {actor.role === 'hunter' && <p><kbd>{keyboard('selectShot')}</kbd> Change shot element</p>}
      </div>
      <div><p><b>Controller · current bindings</b><br/>Left stick moves · right stick looks<br/>{controller('targetAllyPrevious')} / {controller('targetAllyNext')} allies<br/>{controller('targetEnemyPrevious')} / {controller('targetEnemyNext')} enemies<br/>{controller('recenter')} recenter<br/>Menus: D-pad navigates, A selects, B goes back.</p>
        {guideAbilities(actor, controls, 'controller').map(ability => <p key={ability.command}><kbd>{ability.binding}</kbd> {ability.name}</p>)}
        {actor.role === 'hunter' && <p><kbd>{controller('selectShot')}</kbd> Change shot element</p>}
      </div>
    </div>
    <p className="muted">These prompts follow your saved bindings. Divine ultimates unlock against Logos; the ability bar shows readiness and cooldowns.</p>
  </>;
}
