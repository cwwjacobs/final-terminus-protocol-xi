import { ICONS, type IconName } from './icons';

/** One registry icon as inline SVG. It sizes from the surrounding font-size
 * (1em) so the existing .ability-icon, .portrait and nav rules keep working,
 * and it inherits color. Decorative by default; pass a label when the icon is
 * the only content of a control. */
export default function Icon({ name, className = '', label }: { name: IconName; className?: string; label?: string }) {
  const definition = ICONS[name];
  return <svg className={`ui-icon ${className}`.trim()} viewBox={`0 0 ${definition.box} ${definition.box}`} width="1em" height="1em"
    fill="none" stroke="currentColor" strokeWidth={definition.stroke} strokeLinecap="round" strokeLinejoin="round"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    {definition.shapes.map((shape, index) => shape.fill
      ? <path key={index} d={shape.d} fill="currentColor" stroke="none"/>
      : <path key={index} d={shape.d} strokeWidth={shape.width}/>)}
  </svg>;
}
