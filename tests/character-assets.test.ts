import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { HERO_ASSET_MANIFEST } from '../components/game/hero-assets.ts';

type AssetReceipt = { id: string; file: string; bytes: number; sha256: string };
const assetRoot = new URL('../public/assets/models/', import.meta.url);
const receipt = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8')) as { models: AssetReceipt[] };

test('the five shipped heroes match the immutable copy receipt and runtime URLs', () => {
  assert.deepEqual(receipt.models.map(model => model.id).sort(), Object.keys(HERO_ASSET_MANIFEST).sort());
  for (const model of receipt.models) {
    const bytes = readFileSync(new URL(model.file, assetRoot));
    assert.equal(bytes.length, model.bytes, model.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256, model.id);
    assert.equal(HERO_ASSET_MANIFEST[model.id as keyof typeof HERO_ASSET_MANIFEST], `/assets/models/${model.file}`);
  }
});

test('shipped GLBs include self-contained textures, skins and the two supported motion clips', () => {
  for (const model of receipt.models) {
    const bytes = readFileSync(new URL(model.file, assetRoot));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.deepEqual(json.animations.map((clip: { name: string }) => clip.name).sort(), ['idle', 'walk'], model.id);
    assert.ok(json.skins.length > 0);
    for (const skin of json.skins) assert.equal(skin.joints.length, 22, model.id);
    assert.ok(json.images.length > 0);
    for (const resource of [...json.buffers, ...json.images]) assert.equal(resource.uri, undefined, 'No external image/buffer dependency');
    assert.ok(json.meshes.every((mesh: { primitives: { attributes: Record<string, number> }[] }) => mesh.primitives.every(primitive =>
      'POSITION' in primitive.attributes && 'JOINTS_0' in primitive.attributes && 'WEIGHTS_0' in primitive.attributes)), model.id);
  }
});
