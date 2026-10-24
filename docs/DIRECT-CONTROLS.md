# Direct combat controls

The default combat interface has one visible activation per action. PC shows a compact persistent bar; controller uses a separate button-shaped arrangement; touch uses a left movement stick and one right-hand ability cluster. All three resolve the same role-slot registry in `control-settings.ts`. There is no default Commands/quick-actions step and no standalone Revelry activation.

| Slot | Keyboard | Controller | Bacchus | Heracles | Dolos | Hecate | Ariadne |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Primary 1 | 1 | X | Cleave | Cleave | Cleave | Fire | Restore |
| Primary 2 | 2 | Y | Pierce | Pierce | Pierce | Ice | Aegis |
| Primary 3 | 3 | RB | Resonance | Resonance | Resonance | Thunder | — |
| Technique | Q | RT | Critical Dash | Provoke | Split Volley | Rapid Weave | — |
| Support | E | LT | Revelry | — | — | — | — |
| Guard | Left Shift | LB | Guard | Guard | Guard | Guard | Guard |
| Evade | C | B | Evade | Evade | Evade | Evade | Evade |
| Auto attacks | Space | A | Engage/disengage | Engage/disengage | Engage/disengage | Engage/disengage | Engage/disengage |

Unused slots do not render empty framed buttons. Ariadne has one Guard activation, in the shared defense slot. Status effects such as Revelry stacks and Aegis charges are small noninteractive indicators. Cooldown values appear over the relevant icon; key/controller labels use the effective saved binding, with an explicit Unbound label if a custom map lacks one. Heal selection is separate from enemy lock and is sent through the existing authoritative target-receipt flow.

Version 5 adds complete role utility mappings. Exact untouched v4 keyboard/controller presets migrate independently. A custom keyboard map does not prevent an untouched controller map from upgrading, or vice versa; explicit saved custom choices and unbinds are retained. Direct ability overrides and the old Commands menu remain optional configurable inputs. The controls panel identifies missing effective mappings by input type.

Input checks cover role dispatch, directional targeting, safe migration/rebinding, trigger press/release gating, and isolation of menu A/B from gameplay. Presentation checks cover unique visible role slots and complete default mappings. Physical controller/touch reach and rendered 3D screenshots remain separate device checks.
