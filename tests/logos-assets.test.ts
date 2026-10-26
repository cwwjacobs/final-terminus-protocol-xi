import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = new URL('../public/assets/logos/', import.meta.url);
const parts = ['body','head','neck','arm-screen-left','hand-screen-left','arm-screen-right','hand-screen-right','crown'];
const statues = ['observation','judgment','memory','reason','order','knowledge'];

test('every shipped Logos texture is real self-contained vector art, not an HTTP error document', () => {
  const names = [...parts.map(p=>`giant-${p}`), ...statues.map(p=>`sentinel-${p}`), 'rush-melee-charge','rush-leap-attack','rush-ranged-throw','coherence-seal'];
  for (const name of names) {
    const svg = readFileSync(new URL(`${name}.svg`,base),'utf8');
    assert.match(svg, /<svg[\s>]/,name); assert.match(svg,/viewBox=/,name); assert.match(svg,/<path[\s>]|<circle[\s>]/,name);
    assert.doesNotMatch(svg,/<(?:html|script|image)[\s>]/i,name); assert.doesNotMatch(svg,/(?:href|src)=["']https?:/i,name);
  }
  const manifest = JSON.parse(readFileSync(new URL('figma-manifest.json',base),'utf8'));
  assert.equal(manifest.fileKey,'8SvJbL5Kaqkf3jmMyRCF3y');assert.deepEqual(manifest.giantParts,parts);
});
