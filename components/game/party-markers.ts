import * as THREE from 'three';
import type { Actor, Role } from '../../game/types.ts';
import { partyFeedback } from './world-feedback.ts';

export const ROLE_MARKERS: Record<Role, { sides: number; glyph: string; label: string }> = {
  vanguard: { sides: 6, glyph: '⬡', label: 'VANGUARD' },
  warden: { sides: 4, glyph: '◇', label: 'WARDEN' },
  hunter: { sides: 3, glyph: '△', label: 'HUNTER' },
  arcanist: { sides: 8, glyph: '✧', label: 'ARCANIST' },
  luminary: { sides: 40, glyph: '○', label: 'LUMINARY' },
};

/** Role color and shape, white selection corners, a TP arc and a steady low-HP
 * border have distinct jobs. These are attached to visual roots, never actors. */
export function createPartyMarker(role: Role, color: string, quality: 'low' | 'high') {
  const root = new THREE.Group();
  const segments = quality === 'high' ? 64 : 32;
  const addRing = (inner: number, outer: number, sides: number, paint: string, opacity: number, y: number) => {
    const material = new THREE.MeshBasicMaterial({ color: paint, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const item = new THREE.Mesh(new THREE.RingGeometry(inner, outer, sides), material);
    item.rotation.x = -Math.PI / 2; item.position.y = y; root.add(item); return item;
  };
  const identity = addRing(.5, .565, ROLE_MARKERS[role].sides, color, .8, .075);
  const tp = addRing(.66, .71, segments, '#ffe5a0', .8, .077);
  const danger = addRing(.77, .82, 8, '#ff9b88', .95, .079);
  const selection = new THREE.Group(); root.add(selection);
  const cornerGeometry = new THREE.RingGeometry(.91, .975, 8, 1, 0, Math.PI / 5);
  const cornerMaterial = new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const corner = new THREE.Mesh(cornerGeometry, cornerMaterial); corner.rotation.x = -Math.PI / 2;
    corner.rotation.z = i * Math.PI / 2 + Math.PI / 8; corner.position.y = .081; selection.add(corner);
  }
  return {
    root,
    update(actor: Actor, selected: boolean): void {
      const cue = partyFeedback(actor); root.visible = cue.alive;
      identity.material.opacity = selected ? 1 : actor.engaged ? .8 : .6;
      selection.visible = selected;
      danger.visible = cue.lowHp;
      tp.visible = cue.tpFraction > 0;
      tp.geometry.setDrawRange(0, Math.ceil(segments * cue.tpFraction) * 6);
      tp.material.opacity = cue.tpReady ? 1 : .42;
      tp.scale.setScalar(cue.tpReady ? 1.06 : 1);
    },
    // Geometry/materials enter Scene's deduplicated traversal disposal path.
  };
}
