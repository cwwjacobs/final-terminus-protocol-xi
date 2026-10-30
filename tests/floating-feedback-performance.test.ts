import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FloatingFeedback } from '../components/game/floating-feedback.ts';

test('empty number slots avoid DOM writes; expiration hides once and reuse still renders', () => {
  let opacityWrites = 0;
  class Element {
    children: Element[] = [];
    style = new Proxy<Record<string, string>>({}, { set(target, name, value) {
      if (name === 'opacity') opacityWrites++;
      target[name as string] = value; return true;
    } });
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    removed = false;
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    appendChild(child: Element) { this.children.push(child); }
    remove() { this.removed = true; }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => new Element(), createElementNS: () => new Element(),
  } });
  try {
    const host = new Element(), overlay = new FloatingFeedback(host as unknown as HTMLElement, 24);
    const camera = new THREE.PerspectiveCamera(58, 1, .1, 100);
    camera.position.set(0, 2, 10); camera.lookAt(0, 2, 0); camera.updateMatrixWorld();
    const tick = (dt = 1 / 60) => overlay.update(dt, camera, 800, 800, true);
    const initial = opacityWrites;
    for (let i = 0; i < 600; i++) tick();
    assert.equal(opacityWrites, initial, 'idle pool never dirties DOM styles');
    overlay.spawn({ id: 1, target: 0, tone: 'heal', text: '+100' }, { x: 0, y: 2, z: 0 }); tick();
    assert.equal(opacityWrites, initial + 1, 'only the active number updates');
    const label = host.children[0].children[1];
    assert.equal(label.style.opacity, '1');
    for (let i = 0; i < 180; i++) tick();
    assert.equal(label.style.opacity, '0');
    const expired = opacityWrites;
    for (let i = 0; i < 600; i++) tick();
    assert.equal(opacityWrites, expired, 'expired slots are hidden once');
    overlay.spawn({ id: 2, target: 0, tone: 'damage', text: '200' }, { x: 0, y: 2, z: 0 }); tick();
    assert.equal(label.dataset.value, '200'); assert.equal(label.style.opacity, '1');
    overlay.reset(); assert.equal(label.style.opacity, '0');
    const reset = opacityWrites; tick(); assert.equal(opacityWrites, reset);
    overlay.dispose(); assert.equal(host.children[0].removed, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
