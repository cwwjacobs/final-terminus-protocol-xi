import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMERA_DEFAULTS, CAMERA_LIMITS, calculateCameraPose, calculateCameraViewOffset, cameraLockTarget, createCamera, orbitCamera, recenterCamera, trackCameraTarget, zoomCamera } from '../components/game/camera.ts';
import { applyAction, createGame } from '../game/engine.ts';
import { movement } from '../components/game/input.ts';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('camera starts behind the supplied facing with the agreed default zoom', () => {
  const camera = createCamera(Math.PI);
  const actor = { x: 3, z: 5 };
  const pose = calculateCameraPose(camera, actor, CAMERA_DEFAULTS.height, 0);
  assert.equal(camera.distance, 12);
  near(pose.position.x, actor.x);
  assert.ok(pose.position.z > actor.z);
  assert.ok(pose.lookAt.z < actor.z);
  assert.ok(pose.position.y > pose.lookAt.y);
});

test('signed orbit looks right and up without changing actor state or yaw on pitch-only input', () => {
  const camera = createCamera(Math.PI);
  const actor = { x: 0, z: 0, facing: Math.PI };
  const before = calculateCameraPose(camera, actor, 1.5, 0);
  orbitCamera(camera, -.25, -.12);
  const after = calculateCameraPose(camera, actor, 1.5, 0);
  assert.ok(camera.yaw < Math.PI);
  assert.ok(after.lookAt.x > before.lookAt.x, 'right input turns the view toward screen-right');
  assert.ok(after.position.y < before.position.y, 'look-up input lowers elevation/pitch');
  assert.deepEqual(actor, { x: 0, z: 0, facing: Math.PI });
  const yaw = camera.yaw;
  orbitCamera(camera, 0, .1);
  near(camera.yaw, yaw);
});

test('orbit remains independent of actor facing until explicit recenter', () => {
  const camera = createCamera(0, 17);
  orbitCamera(camera, -.7, .3);
  const pose = calculateCameraPose(camera, { x: 2, z: 4, facing: 0 } as { x: number; z: number }, 1.5, 0);
  const changedFacingPose = calculateCameraPose(camera, { x: 2, z: 4, facing: Math.PI } as { x: number; z: number }, 1.5, 0);
  assert.deepEqual(changedFacingPose, pose);
  recenterCamera(camera, Math.PI / 2);
  near(camera.yaw, Math.PI / 2);
  near(camera.pitch, CAMERA_DEFAULTS.pitch);
  assert.equal(camera.distance, 17, 'recenter preserves chosen zoom');
});

test('pitch and distance stop at bounds, and signed zoom moves in the requested direction', () => {
  const camera = createCamera(0);
  const yaw = camera.yaw, pitch = camera.pitch;
  zoomCamera(camera, 2);
  assert.equal(camera.distance, 14);
  zoomCamera(camera, -3);
  assert.equal(camera.distance, 11);
  assert.equal(camera.yaw, yaw);
  assert.equal(camera.pitch, pitch);
  zoomCamera(camera, 1e300);
  assert.equal(camera.distance, CAMERA_LIMITS.maxDistance);
  zoomCamera(camera, -1e300);
  assert.equal(camera.distance, CAMERA_LIMITS.minDistance);
  orbitCamera(camera, 0, 100);
  assert.equal(camera.pitch, CAMERA_LIMITS.maxPitch);
  orbitCamera(camera, 0, -100);
  assert.equal(camera.pitch, CAMERA_LIMITS.minPitch);
});

test('yaw wraps through a complete orbit without changing its direction', () => {
  const camera = createCamera(Math.PI - .1);
  orbitCamera(camera, .2, 0);
  assert.ok(camera.yaw >= -Math.PI && camera.yaw <= Math.PI);
  near(Math.sin(camera.yaw), Math.sin(Math.PI + .1));
  near(Math.cos(camera.yaw), Math.cos(Math.PI + .1));
});

test('positive shoulder moves the view to camera-right for both forward conventions', () => {
  for (const yaw of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const camera = createCamera(yaw);
    const centered = calculateCameraPose(camera, { x: 1, z: -2 }, 1.5, 0);
    const shoulder = calculateCameraPose(camera, { x: 1, z: -2 }, 1.5, 2);
    near(shoulder.position.x - centered.position.x, -Math.cos(yaw) * 2);
    near(shoulder.position.z - centered.position.z, Math.sin(yaw) * 2);
    near(shoulder.lookAt.x - centered.lookAt.x, shoulder.position.x - centered.position.x);
    near(shoulder.lookAt.z - centered.lookAt.z, shoulder.position.z - centered.position.z);
  }
});

test('pose clamps height and shoulder without mutating caller state', () => {
  const camera = Object.freeze({ yaw: .5, pitch: -100, distance: 1000 });
  const actor = Object.freeze({ x: 4, z: 8 });
  const pose = calculateCameraPose(camera, actor, 100, -100);
  const expected = calculateCameraPose({ yaw: .5, pitch: CAMERA_LIMITS.minPitch, distance: CAMERA_LIMITS.maxDistance }, actor, CAMERA_LIMITS.maxHeight, CAMERA_LIMITS.minShoulderOffset);
  assert.deepEqual(pose, expected);
  assert.deepEqual(camera, { yaw: .5, pitch: -100, distance: 1000 });
  assert.deepEqual(actor, { x: 4, z: 8 });
});

test('invalid inputs and every bound combination produce a finite pose above the floor', () => {
  const invalid = calculateCameraPose({ yaw: NaN, pitch: Infinity, distance: -Infinity }, { x: NaN, z: Infinity }, NaN, Infinity);
  assert.ok(Object.values(invalid.position).every(Number.isFinite));
  assert.ok(Object.values(invalid.lookAt).every(Number.isFinite));
  const camera = createCamera(NaN, Infinity);
  orbitCamera(camera, NaN, Infinity); zoomCamera(camera, NaN);
  assert.ok(Object.values(camera).every(Number.isFinite));
  for (const pitch of [CAMERA_LIMITS.minPitch, CAMERA_LIMITS.maxPitch])
    for (const distance of [CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance])
      for (const height of [CAMERA_LIMITS.minHeight, CAMERA_LIMITS.maxHeight])
        for (const shoulder of [CAMERA_LIMITS.minShoulderOffset, CAMERA_LIMITS.maxShoulderOffset]) {
          const pose = calculateCameraPose({ yaw: Math.PI, pitch, distance }, { x: -12, z: 5 }, height, shoulder);
          assert.ok(Object.values(pose.position).every(Number.isFinite));
          assert.ok(Object.values(pose.lookAt).every(Number.isFinite));
          assert.ok(pose.position.y > 0, 'camera stays above arena floor');
          assert.ok(pose.position.y > pose.lookAt.y, 'bounded pitch keeps view downward');
          assert.notDeepEqual(pose.position, pose.lookAt, 'view direction never collapses');
        }
});

test('short viewport projection clears the actual dock while the larger view stays unchanged', () => {
  const orbit = Object.freeze(createCamera(Math.PI));
  const pose = calculateCameraPose(orbit, { x: -4, z: 11 }, 1.5, 0);
  for (const [width, height, dockTop] of [[1280, 720, 450], [1625, 901, 620]]) {
    const camera = new THREE.PerspectiveCamera(58, width / height, .15, 220);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    camera.updateMatrixWorld();
    const projectY = (x: number, y: number, z: number) => {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return (-p.y * .5 + .5) * height;
    };
    const originalFootY = projectY(-4, 0, 11);
    const offset = calculateCameraViewOffset(height, originalFootY, dockTop);
    if (offset > 0) camera.setViewOffset(width, height, 0, offset, width, height);
    const footY = projectY(-4, 0, 11), headY = projectY(-4, 2.5, 11), haloY = projectY(0, 8.5, -4);
    assert.ok(footY <= dockTop - 17.99, `${width}x${height}: feet ${footY} overlap dock ${dockTop}`);
    assert.ok(headY > 0 && headY < footY, 'entire controlled silhouette remains in view');
    assert.ok(haloY > 0, 'spawn-distance boss crown stays in frame');
    if (height === 901) { assert.equal(offset, 0); near(footY, originalFootY); }
    else assert.ok(offset > 30 && offset < 45);
    assert.deepEqual(calculateCameraPose(orbit, { x: -4, z: 11 }, 1.5, 0), pose, 'projection does not change control state or pose');
  }
});

test('viewport framing shift is bounded and handles missing or invalid layout safely', () => {
  assert.equal(calculateCameraViewOffset(720, 470, 10), 720 * .12);
  assert.equal(calculateCameraViewOffset(901, 587, 901), 0);
  assert.equal(calculateCameraViewOffset(0, 470, 450), 0);
  assert.equal(calculateCameraViewOffset(NaN, 470, 450), 0);
  assert.equal(calculateCameraViewOffset(720, Infinity, 450), 0);
  assert.equal(calculateCameraViewOffset(720, 470, NaN), 0);
});

test('camera locks only for the controlled living engaged actor and releases with encounter state', () => {
  const state = createGame('trial');
  assert.equal(cameraLockTarget(state, 0), null);
  applyAction(state, 0, { type: 'start' });
  assert.equal(cameraLockTarget(state, 0), state.boss);
  assert.equal(cameraLockTarget(state, 1), null, 'another actor engaging must not lock this slot');
  applyAction(state, 0, { type: 'engage' });
  assert.equal(cameraLockTarget(state, 0), null, 'disengage releases even while the party is fighting');
  applyAction(state, 0, { type: 'engage' });
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(cameraLockTarget(restored, 0), restored.boss, 'restored/online snapshots need no local selection marker');
  state.party[0].hp = 0;
  assert.equal(cameraLockTarget(state, 0), null);
  state.party[0].hp = 100;
  state.boss.hp = 0;
  assert.equal(cameraLockTarget(state, 0), null);
  state.boss.hp = 100;
  for (const status of ['ready', 'victory', 'defeat'] as const) {
    state.status = status;
    assert.equal(cameraLockTarget(state, 0), null);
  }
});

test('combat tracking faces the enemy from every side without changing game state or zoom', () => {
  const state = createGame('trial');
  applyAction(state, 0, { type: 'start' });
  const before = structuredClone(state), actor = state.party[0];
  for (const angle of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI - .01]) {
    const camera = createCamera(angle + 2, 18);
    orbitCamera(camera, 0, .5);
    const target = { x: actor.x + Math.sin(angle) * 9, z: actor.z + Math.cos(angle) * 9 };
    for (let i = 0; i < 240; i++) trackCameraTarget(camera, actor, target, 1 / 60);
    near(Math.sin(camera.yaw), Math.sin(angle));
    near(Math.cos(camera.yaw), Math.cos(angle));
    near(camera.pitch, CAMERA_DEFAULTS.pitch);
    assert.equal(camera.distance, 18);
    const forward = movement(0, 1, camera.yaw), strafe = movement(1, 0, camera.yaw);
    assert.ok(forward.x * (target.x - actor.x) + forward.z * (target.z - actor.z) > 8.99);
    near(strafe.x * (target.x - actor.x) + strafe.z * (target.z - actor.z), 0);
  }
  assert.deepEqual(state, before);
});

test('look input cannot break engagement lock, zoom works, and free orbit resumes without a snap', () => {
  const state = createGame('trial'), camera = createCamera(.8, 16);
  applyAction(state, 0, { type: 'engage' });
  const before = { ...camera };
  orbitCamera(camera, 1, .8, !!cameraLockTarget(state, 0));
  assert.deepEqual(camera, before, 'all mouse, key and stick look input shares this guard');
  zoomCamera(camera, -2);
  assert.equal(camera.distance, 14);
  trackCameraTarget(camera, state.party[0], cameraLockTarget(state, 0), .05);
  const lockedView = { ...camera };
  applyAction(state, 0, { type: 'engage' });
  trackCameraTarget(camera, state.party[0], cameraLockTarget(state, 0), .05);
  assert.deepEqual(camera, lockedView, 'release keeps the last view');
  orbitCamera(camera, .2, .1, !!cameraLockTarget(state, 0));
  near(camera.yaw, lockedView.yaw + .2);
  near(camera.pitch, lockedView.pitch + .1);
  assert.equal(camera.distance, 14);
});

test('tracking crosses the yaw seam along the short arc and avoids whips at target overlap', () => {
  const camera = createCamera(Math.PI - .01);
  trackCameraTarget(camera, { x: 0, z: 0 }, { x: -.1, z: -10 }, .05);
  assert.ok(Math.abs(Math.atan2(Math.sin(camera.yaw - Math.PI), Math.cos(camera.yaw - Math.PI))) < .01);
  const yaw = camera.yaw;
  for (const target of [{ x: 0, z: 0 }, { x: .1, z: .1 }, { x: -.2, z: -.2 }]) {
    trackCameraTarget(camera, { x: 0, z: 0 }, target, .05);
    near(camera.yaw, yaw);
  }
  trackCameraTarget(camera, { x: 0, z: 0 }, { x: 0, z: 10 }, 5);
  assert.ok(Math.abs(Math.atan2(Math.sin(camera.yaw - yaw), Math.cos(camera.yaw - yaw))) <= .175 + 1e-9, 'resume/crossing rotation is bounded');
});
