'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Action, GameState } from '@/game/types';
import { ARENA_RADIUS, BURST_WINDOW, CONE_HALF_ANGLE, MAGIC } from '@/game/content';
import { ActorAssets, animateActor, createActor, createCrownResonance, type ActorRig } from './actors';
import { HeroAssetCache, type HeroVisual } from './hero-assets';
import { activeBurst } from './combat-feedback';
import Icon from './Icon';
import { roleIcon } from './icons';
import { actorStatusFeedback, bossWarning, combatNumber, immediateImpact, PresentationEvents } from './world-feedback';
import { createStormEffects } from './storm-effects';
import { createCinematicEnvironment } from './cinematic-environment';
import { createCinematicCombat } from './cinematic-combat';
import { RenderBudget } from './render-budget';
import { createAbilityEffects } from './ability-effects';
import { createDivinePresentation } from './divine-visuals';
import { logosSequencePresentation } from './logos-encounter-visuals';
import { createLogosRig } from './logos-rig';
import { offensiveTarget, sequenceLocked } from '../../game/logos.ts';
import { presentationContact } from './presentation-cues';
import { FloatingFeedback } from './floating-feedback';
import { createPartyMarker } from './party-markers';
import { CAMERA_DEFAULTS, calculateCameraPose, calculateCameraViewOffset, cameraLockTarget, createCamera, trackCameraTarget, type CameraState } from './camera';

export interface SceneProps {
  state: GameState;
  slot: number;
  quality: 'low' | 'high';
  wireframe: boolean;
  characterStyle: 'painted' | 'scaffold';
  cameraState: CameraState;
  cameraHeight: number;
  shoulderOffset: number;
  selectedTarget: string | null;
  /** Friendly soft target, independent of the selected enemy/camera lock. */
  selectedAlly?: number | null;
  targetPulse: number;
  /** Changes when the client replaces an encounter/session, even at equal clocks. */
  presentationEpoch?: number;
  /** Local menus pause combat; online rooms continue beneath their menus. */
  presentationActive?: boolean;
  onIntent: (action: Action) => void;
  onTelemetry?: (data: { fps: number; drawCalls: number; triangles: number }) => void;
  onGamepad?: (connected: boolean) => void;
  onLoadStatus?: (status: { ready: boolean; loaded: number; total: number; error?: string }) => void;
}

const floorRotation = -Math.PI / 2;
const labelStyle = {
  position: 'absolute' as const, top: 0, left: 0, pointerEvents: 'none' as const,
  color: '#eee8d9', fontFamily: 'Arial, sans-serif', fontSize: 10,
  letterSpacing: '0.12em', fontWeight: 600, textShadow: '0 1px 6px #000, 0 1px 3px #000',
  whiteSpace: 'nowrap' as const, willChange: 'transform', opacity: 0,
};

function mesh(scene: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  x = 0, y = 0, z = 0) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z); scene.add(result); return result;
}

function ring(scene: THREE.Object3D, inner: number, outer: number, color: string, opacity = 1, y = .018) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 });
  const result = mesh(scene, new THREE.RingGeometry(inner, outer, 128), material, 0, y, 0);
  result.rotation.x = floorRotation; return result;
}

/** A sector in local x/z, centered on local +z. Same cone half-angle as the engine. */
function sectorGeometry(halfAngle: number) {
  const segments = 48, coordinates: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = -halfAngle + i / segments * halfAngle * 2;
    const b = -halfAngle + (i + 1) / segments * halfAngle * 2;
    coordinates.push(0, 0, 0, Math.sin(a), 0, Math.cos(a), Math.sin(b), 0, Math.cos(b));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.computeVertexNormals(); return geometry;
}

function buildWorld(scene: THREE.Scene, quality: 'low' | 'high') {
  const stone = new THREE.MeshStandardMaterial({ color: '#0c0c10', metalness: .48, roughness: .5 });
  const edge = new THREE.MeshStandardMaterial({ color: '#38363a', metalness: .7, roughness: .4 });
  const floorGroup = new THREE.Group(); floorGroup.name = 'encounter-floor'; scene.add(floorGroup);
  const floorSegments = quality === 'high' ? 96 : 48;
  const platform = mesh(floorGroup, new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS + .6, .8, floorSegments), edge, 0, -.42);
  platform.receiveShadow = true;
  const ground = mesh(floorGroup, new THREE.CircleGeometry(ARENA_RADIUS, floorSegments), stone, 0, .001);
  ground.rotation.x = floorRotation; ground.receiveShadow = true;
  ring(floorGroup, ARENA_RADIUS - .32, ARENA_RADIUS - .22, '#b39a65', .65);
  ring(floorGroup, ARENA_RADIUS - .8, ARENA_RADIUS - .77, '#a2926b', .75);
  ring(floorGroup, 18.95, 19.02, '#6e7f8a', .42);
  ring(floorGroup, 12.95, 13.02, '#6e7f8a', .42);
  ring(floorGroup, 6.95, 7.02, '#6e7f8a', .42);
  ring(floorGroup, 2.7, 2.76, '#d6bc83', .7);
  ring(floorGroup, .7, .74, '#d6bc83', .6);

  // Radial inlay and concentric etched paths are a single line draw call.
  const lines: number[] = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const start = i % 4 ? 19.5 : 3.2;
    lines.push(s * start, .025, c * start, s * 23.45, .025, c * 23.45);
    if (i % 4 === 0) {
      lines.push(s * 5, .026, c * 5, Math.sin(a + .09) * 7, .026, Math.cos(a + .09) * 7);
      lines.push(Math.sin(a + .09) * 7, .026, Math.cos(a + .09) * 7, Math.sin(a + .09) * 11.5, .026, Math.cos(a + .09) * 11.5);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  floorGroup.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#9b957c', transparent: true, opacity: .25 })));

  // The Quantum Realm is an open void: no decorative spires, floating stone
  // shards, orbital gates or star dome around the readable combat platform.
  const floorMaterials: { material: THREE.Material; opacity: number; transparent: boolean }[] = [];
  const known = new Set<THREE.Material>();
  floorGroup.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!known.has(material)) { known.add(material); floorMaterials.push({ material, opacity: material.opacity, transparent: material.transparent }); }
    }
  });
  return { floorGroup, floorMaterials, stone };
}

interface Effect {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  life: number;
  duration: number;
  size: number;
  calm: boolean;
}

function createEffects(scene: THREE.Scene, quality: 'low' | 'high'): Effect[] {
  const effects: Effect[] = [];
  const ringGeometry = new THREE.RingGeometry(.72, 1, 40);
  const beamGeometry = new THREE.CylinderGeometry(.025, .08, 1, 5, 1, true);
  for (let i = 0; i < (quality === 'high' ? 18 : 10); i++) {
    const root = new THREE.Group(); root.visible = false;
    const paint = new THREE.MeshBasicMaterial({ color: '#e8c786', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const effectRing = new THREE.Mesh(ringGeometry, paint); effectRing.rotation.x = floorRotation;
    const beam = new THREE.Mesh(beamGeometry, paint); root.add(effectRing, beam); scene.add(root);
    effects.push({ root, ring: effectRing, beam, life: 0, duration: 1, size: 1, calm: false });
  }
  return effects;
}

/** Allocated once, attached to each actor's authoritative world root. Shared
 * geometry is collected by the scene's existing single-disposal cleanup. */
function createStatusCues(rigs: ActorRig[], quality: 'low' | 'high') {
  const barrierGeometry = new THREE.SphereGeometry(1, quality === 'high' ? 24 : 16, 12);
  const waveGeometry = new THREE.TorusGeometry(.9, .015, 4, 40);
  const gemGeometry = new THREE.OctahedronGeometry(.075, 0);
  return rigs.map(rig => {
    const shield = new THREE.Group(); shield.visible = false; rig.root.add(shield);
    const material = new THREE.MeshBasicMaterial({ color: '#b5ffed', transparent: true, opacity: .075,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shell = mesh(shield, barrierGeometry, material, 0, 1.1); shell.scale.set(.85, 1.15, .85);
    const waveMaterial = new THREE.MeshBasicMaterial({ color: '#d5fff2', transparent: true, opacity: .5,
      blending: THREE.AdditiveBlending, depthWrite: false });
    [.4, 1.1, 1.8].forEach((y, index) => {
      const wave = mesh(shield, waveGeometry, waveMaterial, 0, y);
      wave.rotation.x = floorRotation; wave.scale.setScalar(index === 1 ? 1 : .75);
    });
    const weave = new THREE.Group(); weave.visible = false; rig.root.add(weave);
    ring(weave, .78, .81, '#d8abff', .6, .09);
    const elements = ['fire', 'ice', 'lightning'] as const;
    const gems = elements.map((element, i) => {
      const gem = mesh(weave, gemGeometry, new THREE.MeshBasicMaterial({ color: MAGIC[element].color,
        transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
      gem.position.set(Math.sin(i * Math.PI * 2 / 3) * .87, .45, Math.cos(i * Math.PI * 2 / 3) * .87);
      return { element, mesh: gem };
    });
    const selected = ring(rig.root, 1.02, 1.09, '#95f5d4', .95, .075); selected.visible = false;
    return { shield, weave, gems, selected };
  });
}

export default function Scene(props: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const latest = useRef(props);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    latest.current.onLoadStatus?.({ ready: false, loaded: 0, total: props.characterStyle === 'painted' ? props.state.party.length : 0 });
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: props.quality === 'high', alpha: false, powerPreference: 'high-performance' });
    } catch {
      // Renderer startup is external system state; surface its failure in the UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('The 3D renderer could not start. Enable WebGL / hardware acceleration, then reload to enter the Quantum Plane.');
      latest.current.onLoadStatus?.({ ready: false, loaded: 0, total: props.state.party.length, error: 'The battlefield needs WebGL. Enable hardware acceleration, then reload to enter.' });
      return;
    }
    setError(null);
    const renderBudget = new RenderBudget(props.quality, window.devicePixelRatio || 1);
    renderer.setPixelRatio(renderBudget.pixelRatio);
    renderer.domElement.dataset.renderScale = String(renderBudget.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = props.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
    renderer.domElement.setAttribute('aria-label', 'Third-person Quantum Plane battlefield');
    renderer.domElement.dataset.gameCanvas = 'true';
    host.insertBefore(renderer.domElement, host.firstChild);

    const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
    scene.fog = new THREE.FogExp2('#000001', .004);
    const camera = new THREE.PerspectiveCamera(58, 1, .15, 220);
    scene.add(new THREE.HemisphereLight('#c2c7cf', '#09080d', 1.8));
    const key = new THREE.DirectionalLight('#ffdfac', 3.1); key.position.set(-10, 18, 9);
    key.castShadow = props.quality === 'high'; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -27; key.shadow.camera.right = 27; key.shadow.camera.top = 27; key.shadow.camera.bottom = -27;
    key.shadow.camera.near = 1; key.shadow.camera.far = 65; key.shadow.bias = -.001; scene.add(key);
    const rim = new THREE.DirectionalLight('#a5b6d1', 1.7); rim.position.set(8, 9, -16); scene.add(rim);
    const world = buildWorld(scene, props.quality);
    const atmosphere = createCinematicEnvironment(scene, world.floorGroup, props.quality);
    const assets = new ActorAssets();
    const rigs: ActorRig[] = latest.current.state.party.map(actor => {
      const rig = createActor(assets, actor.role, actor.color);
      rig.root.position.set(actor.x, 0, actor.z); rig.root.rotation.y = actor.facing;
      scene.add(rig.root); return rig;
    });
    const partyMarkers = latest.current.state.party.map((actor, i) => {
      const marker = createPartyMarker(actor.role, actor.color, props.quality);
      rigs[i].root.add(marker.root); rigs[i].marker.visible = false; return marker;
    });
    const statusCues = createStatusCues(rigs, props.quality);
    const heroCache = new HeroAssetCache();
    const heroVisuals: (HeroVisual | null)[] = rigs.map(() => null);
    const bossRig = createCrownResonance(assets); scene.add(bossRig.root);
    const divine = createDivinePresentation(scene, rigs, props.quality);
    const logosRig = createLogosRig(props.quality); scene.add(logosRig.root);
    const escapeLight = new THREE.Group(); escapeLight.name = 'abstract-recall-light'; escapeLight.visible = false; scene.add(escapeLight);
    const recallPaint = new THREE.MeshBasicMaterial({ color: '#e4dcff', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    mesh(escapeLight, new THREE.CylinderGeometry(22, 20, 35, 48, 1, true), recallPaint, 0, 15, 0);
    const recallRing = ring(escapeLight, 20, 21.5, '#f5edff', .6, .03);
    const crownBackground = new THREE.Color('#000000'), lowerBackground = new THREE.Color('#000000'), escapeBackground = new THREE.Color('#b6abc8');
    const crownFog = new THREE.Color('#000001'), lowerFog = new THREE.Color('#010003');
    const crownStone = new THREE.Color('#0c0c10'), lowerStone = new THREE.Color('#0a080e');
    bossRig.root.position.set(latest.current.state.boss.x, 0, latest.current.state.boss.z);

    const targetRing = ring(scene, 2.95, 3.01, '#ead39a', .9, .045);
    const targetMaterial = targetRing.material as THREE.MeshBasicMaterial;
    const burstRing = ring(scene, 3.15, 3.24, '#ffffff', .95, .07);
    const burstMaterial = burstRing.material as THREE.MeshBasicMaterial;
    burstRing.visible = false;
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: '#ead39a', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false });
    const targetReticle = mesh(scene, new THREE.RingGeometry(.6, .64, 4), reticleMaterial);
    targetRing.visible = targetReticle.visible = false;
    const warnMaterial = new THREE.MeshBasicMaterial({ color: '#f3a765', transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false });
    const circleWarn = mesh(scene, new THREE.CircleGeometry(1, 80), warnMaterial, 0, .055); circleWarn.rotation.x = floorRotation;
    const coneWarn = mesh(scene, sectorGeometry(CONE_HALF_ANGLE), warnMaterial, 0, .055);
    const warningEdge = ring(scene, .985, 1, '#ffc28a', .85, .06);
    // Two raid perimeter strokes mean two remaining pulses, read from the cast.
    const echoEdge = ring(scene, .985, 1, '#b5b0ff', .7, .065);
    const decreeMaterial = new THREE.MeshBasicMaterial({ color: '#ff9a91', transparent: true, opacity: .9,
      side: THREE.DoubleSide, depthWrite: false });
    const decreeMark = mesh(scene, new THREE.RingGeometry(.36, .44, 4), decreeMaterial);
    const decreeStem = mesh(scene, new THREE.CylinderGeometry(.018, .045, .7, 5), decreeMaterial);
    echoEdge.visible = decreeMark.visible = decreeStem.visible = false;
    circleWarn.visible = coneWarn.visible = warningEdge.visible = false;
    const effects = createEffects(scene, props.quality);
    const stormEffects = createStormEffects(scene, props.quality);
    const abilityEffects = createAbilityEffects(scene, props.quality, (slot, kind, out) => {
      const visual = heroVisuals[slot];
      if (visual?.getAnchor(kind, out)) return true;
      const rig = rigs[slot];
      if (!rig) return false;
      rig.root.getWorldPosition(out); out.y += 1.3;
      return true;
    });
    const cinema = createCinematicCombat(scene, props.quality, (slot, out) => {
      const visual = heroVisuals[slot];
      if (visual?.getAnchor('hand', out)) return true;
      const rig = rigs[slot]; if (!rig) return false;
      rig.root.getWorldPosition(out); out.y += 1.3; return true;
    }, (event, state, out) => {
      if (state.encounter !== 'logos') return false;
      const actor = state.party[event.actor ?? -1];
      const target = actor ? offensiveTarget(state, actor) : state.boss;
      const id = event.enemyId ?? ('id' in target ? target.id : 'boss');
      const anchor = logosRig.targets.get(id); if (!anchor) return false;
      anchor.getWorldPosition(out); return true;
    });
    const numbers = new FloatingFeedback(host, props.quality === 'high' ? 24 : 12);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
    const onMotionPreference = () => { reducedMotion = motionPreference.matches; };
    motionPreference.addEventListener('change', onMotionPreference);

    let frame = 0, stopped = false, previous = performance.now(), reportAt = previous, frames = 0, animationTime = 0;
    let loadedModels = 0, failedModels = 0;
    renderer.domElement.dataset.characterStyle = props.characterStyle;
    renderer.domElement.dataset.characterModels = '0';
    renderer.domElement.dataset.characterModelFailures = '0';
    void logosRig.ready.then(() => { if (!stopped) renderer.domElement.dataset.logosRig = logosRig.stats.assetStatus; });
    const modelRequests = props.characterStyle === 'painted' ? latest.current.state.party.map((actor, i) => {
        return heroCache.load(actor.id).then(visual => {
          if (stopped) { visual.dispose(); return; }
          const rig = rigs[i];
          visual.setWireframe(latest.current.wireframe);
          // Keep the world root and selection ring. Only replace its artwork.
          rig.body.visible = false; rig.ornament.visible = false;
          rig.root.add(visual.object); heroVisuals[i] = visual;
          renderer.domElement.dataset.characterModels = String(++loadedModels);
        }).catch(() => {
          if (stopped) return;
          // A missing asset leaves this actor's fully functional scaffold visible.
          renderer.domElement.dataset.characterModelFailures = String(++failedModels);
        }).finally(() => {
          if (!stopped) latest.current.onLoadStatus?.({ ready: false, loaded: loadedModels + failedModels, total: latest.current.state.party.length });
        });
      }) : [];
    // A run starts after models (or their scaffold fallbacks) and initial shader
    // compilation are ready, instead of spending the combat clock on loading.
    void Promise.allSettled([...modelRequests, logosRig.ready]).then(async () => {
      if (stopped) return;
      try {
        await renderer.compileAsync(scene, camera);
        if (!stopped) latest.current.onLoadStatus?.({ ready: true, loaded: modelRequests.length, total: modelRequests.length });
      } catch {
        if (!stopped) latest.current.onLoadStatus?.({ ready: false, loaded: loadedModels + failedModels, total: modelRequests.length, error: 'The battlefield could not finish preparing. Return to the title and try Performance graphics.' });
      }
    });
    let eventFeed = new PresentationEvents(latest.current.state, latest.current.presentationEpoch);
    const pendingImpacts: { event: GameState['events'][number]; at: number }[] = [];
    let presentationActive = latest.current.presentationActive !== false && !document.hidden;
    const clearPresentation = () => {
      pendingImpacts.length = 0; numbers.reset(); stormEffects.reset(); abilityEffects.reset(); cinema.reset(); atmosphere.reset(); divine.reset(); logosRig.reset();
      heroVisuals.forEach(visual => visual?.resetCombat());
      rigs.forEach(rig => { rig.attack = 0; }); bossRig.attack = 0;
      effects.forEach(effect => { effect.life = 0; effect.root.visible = false; });
    };
    const rebaselinePresentation = () => {
      clearPresentation();
      eventFeed = new PresentationEvents(latest.current.state, latest.current.presentationEpoch);
      presentationActive = latest.current.presentationActive !== false && !document.hidden;
    };
    // A suspended animation frame must not leave an old contact waiting to
    // play after returning to the tab, even when the local combat clock froze.
    document.addEventListener('visibilitychange', rebaselinePresentation);
    let lastWireframe = !latest.current.wireframe;
    let initializedCamera = false;
    let lastTime = latest.current.state.time;
    let lastTargetPulse = latest.current.targetPulse;
    let lastSelectedTarget: string | null = null;
    let targetPulseAge = 10;
    const fallbackCamera = createCamera(latest.current.state.party[latest.current.slot]?.facing ?? Math.PI);
    const cameraPosition = new THREE.Vector3(), cameraLook = new THREE.Vector3(), smoothedLook = new THREE.Vector3();
    const projected = new THREE.Vector3(), ray = new THREE.Vector3(), beamDirection = new THREE.Vector3();
    const targetWorld = new THREE.Vector3(), feedbackWorld = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const size = new THREE.Vector2();
    // Measure the default silhouette once per layout change. A view offset shifts
    // composition without silently changing the user's orbit, height, or zoom.
    const framingCamera = new THREE.PerspectiveCamera(camera.fov, 1, camera.near, camera.far);
    const defaultPose = calculateCameraPose(createCamera(Math.PI), { x: 0, z: 0 }, CAMERA_DEFAULTS.height, 0);
    framingCamera.position.set(defaultPose.position.x, defaultPose.position.y, defaultPose.position.z);
    framingCamera.lookAt(defaultPose.lookAt.x, defaultPose.lookAt.y, defaultPose.lookAt.z);
    framingCamera.updateMatrixWorld();
    const framingPoint = new THREE.Vector3();
    let actionDock: HTMLElement | null = null;
    const activeSlot = () => Math.max(0, Math.min(rigs.length - 1, latest.current.slot));
    const resize = () => {
      const nextDock = host.parentElement?.querySelector<HTMLElement>('.direct-combat-hud[data-interface="desktop"]') ?? null;
      if (nextDock !== actionDock) {
        if (actionDock) observer.unobserve(actionDock);
        actionDock = nextDock;
        if (actionDock) observer.observe(actionDock);
      }
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height;
      framingCamera.aspect = width / height; framingCamera.updateProjectionMatrix();
      framingPoint.set(0, 0, 0).project(framingCamera);
      const footY = (-framingPoint.y * .5 + .5) * height;
      const dockTop = actionDock && host.parentElement?.dataset.layout !== 'touch' ? actionDock.getBoundingClientRect().top - host.getBoundingClientRect().top : height;
      const offset = calculateCameraViewOffset(height, footY, dockTop);
      if (offset > 0) camera.setViewOffset(width, height, 0, offset, width, height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix(); size.set(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(host);
    // The dock mounts after leaving the title, and changes with the input layout.
    const dockObserver = new MutationObserver(resize);
    if (host.parentElement) dockObserver.observe(host.parentElement, { childList: true, attributes: true, attributeFilter: ['data-layout', 'data-interface', 'data-front'] });
    resize();
    const onContextLost = (event: Event) => {
      event.preventDefault(); stopped = true; cancelAnimationFrame(frame); clearPresentation();
      setError('The graphics context was interrupted. Your game state is retained; reload to restore the 3D view.');
      latest.current.onLoadStatus?.({ ready: false, loaded: loadedModels, total: props.state.party.length, error: 'The graphics context was interrupted. Reload to restore the battlefield.' });
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const spawnEffect = (event: GameState['events'][number], state: GameState) => {
      divine.event(event, state);
      stormEffects.event(event, state);
      cinema.impact(event, state);
      const hitEnemy = event.enemyId ? state.enemies.find(e=>e.id===event.enemyId) : undefined;
      const effectState = hitEnemy ? { ...state, boss: { ...state.boss, x: hitEnemy.x, z: hitEnemy.z } } : state;
      const handled = abilityEffects.impact(event, effectState);
      if (event.kind === 'hit') bossRig.attack = 1;
      if (!['revelry_lost', 'shield'].includes(event.kind) && typeof event.actor === 'number' && rigs[event.actor]) rigs[event.actor].attack = 1;
      const feedback = combatNumber(event, state);
      if (feedback) {
        const target = feedback.target === 'boss' ? bossRig : rigs[feedback.target];
        const height = feedback.target === 'boss' ? 3.4 : heroVisuals[feedback.target]?.labelHeight ?? 2.4;
        const enemy = event.enemyId ? state.enemies.find(enemy => enemy.id === event.enemyId) : undefined;
        const anchor = state.encounter === 'logos' && feedback.target === 'boss' ? logosRig.targets.get(event.enemyId ?? 'boss') : undefined;
        if (anchor) {
          anchor.getWorldPosition(feedbackWorld);
          feedbackWorld.y += .55;
          numbers.spawn(feedback, feedbackWorld);
        } else numbers.spawn(feedback, { x: enemy?.x ?? target.root.position.x, y: enemy ? 2.8 : target.root.position.y + height + .2, z: enemy?.z ?? target.root.position.z });
      }
      if (handled) return;
      if (!['auto', 'weapon', 'chain', 'burst', 'magic', 'heal', 'provoke', 'hit', 'guard', 'dodge', 'revelry', 'revelry_lost', 'shield', 'ability'].includes(event.kind)) return;
      if (event.kind === 'ability' && !['aegis', 'rapidWeave', 'mendingThread'].includes(event.source ?? '')) return;
      // Old saves have no heal recipient. Skip its target effect rather than
      // suggesting that the caster was healed or parsing a human-readable log.
      if (event.kind === 'heal' && !feedback) return;
      if (event.kind === 'shield' && (typeof event.target !== 'number' || !rigs[event.target])) return;
      const index = effects.findIndex(effect => effect.life <= 0), effect = effects[index < 0 ? event.id % effects.length : index];
      const source = typeof event.actor === 'number' ? state.party[event.actor] : undefined;
      const support = ['heal', 'guard', 'dodge', 'provoke', 'hit', 'revelry', 'revelry_lost', 'shield', 'ability'].includes(event.kind);
      const recipient = ['heal', 'shield', 'ability'].includes(event.kind) && typeof event.target === 'number' ? state.party[event.target] : source;
      const attackTarget = source ? offensiveTarget(state, source) : state.boss;
      const eventEnemy = event.enemyId ? state.enemies.find(enemy => enemy.id === event.enemyId) : undefined;
      const targetX = support && recipient ? recipient.x : eventEnemy?.x ?? attackTarget.x;
      const targetZ = support && recipient ? recipient.z : eventEnemy?.z ?? attackTarget.z;
      effect.root.position.set(targetX, .1, targetZ); effect.root.visible = true;
      effect.calm = event.kind === 'heal' || event.kind === 'ability';
      effect.duration = reducedMotion ? .35 : effect.calm ? .9 : ['chain', 'burst', 'revelry'].includes(event.kind) ? 1.05 : .55; effect.life = effect.duration;
      effect.size = event.kind === 'burst' ? 4.8 : ['chain', 'revelry'].includes(event.kind) ? 3.8 : event.kind === 'shield' ? 2.2 : event.kind === 'weapon' ? 2.8 : 1;
      effect.ring.material.color.set(event.source === 'rapidWeave' ? '#d8abff' : effect.calm || event.kind === 'shield' ? '#bcffdf' : event.kind === 'burst' ? '#a4dfff' : event.kind === 'chain' || event.kind === 'magic' ? '#d8abff' : ['hit', 'revelry_lost'].includes(event.kind) ? '#ff996d' : event.critical ? '#fff6a7' : '#ffe0a1');
      effect.beam.visible = Boolean(source && ['auto', 'weapon', 'magic', 'burst'].includes(event.kind));
      if (effect.calm) {
        // A quiet, vertical light shaft distinguishes healing from quantum impact.
        effect.beam.visible = true; effect.beam.position.set(0, 1, 0);
        effect.beam.scale.set(5, 2, 5); effect.beam.quaternion.identity();
      }
      if (source && effect.beam.visible && !effect.calm) {
        beamDirection.set(source.x - targetX, -1, source.z - targetZ);
        const distance = beamDirection.length();
        effect.beam.position.set(beamDirection.x / 2, 1.5, beamDirection.z / 2);
        effect.beam.scale.set(event.kind === 'auto' ? .7 : 2, distance, event.kind === 'auto' ? .7 : 2);
        effect.beam.quaternion.setFromUnitVectors(up, beamDirection.normalize());
      }
    };

    const render = (now: number) => {
      if (stopped) return;
      // Hidden tabs do no scene work. Menus render at 30 Hz; they do not feed
      // the adaptive combat budget or trigger a false resolution reduction.
      if (document.hidden || !presentationActive && now - previous < 1000 / 30) {
        if (document.hidden) { previous = reportAt = now; frames = 0; }
        frame = requestAnimationFrame(render); return;
      }
      const dt = Math.min(.05, Math.max(.001, (now - previous) / 1000)); previous = now;
      animationTime += dt;
      const { state, wireframe, cameraState, cameraHeight, shoulderOffset, selectedTarget, selectedAlly, targetPulse, presentationEpoch } = latest.current;
      const slot = activeSlot(), selected = state.party[slot];
      if (!selected) return;
      const sequence = logosSequencePresentation(state, reducedMotion);
      world.floorGroup.visible = sequence.floorVisible; world.floorGroup.position.y = sequence.floorY; world.floorGroup.scale.setScalar(sequence.floorScale);
      world.floorMaterials.forEach(({ material, opacity, transparent }) => {
        const nextTransparent = transparent || sequence.floorOpacity < 1;
        if (material.transparent !== nextTransparent) { material.transparent = nextTransparent; material.needsUpdate = true; }
        material.opacity = opacity * sequence.floorOpacity;
      });
      world.stone.color.copy(crownStone).lerp(lowerStone, sequence.lowerBlend);
      (scene.background as THREE.Color).copy(crownBackground).lerp(lowerBackground, sequence.lowerBlend).lerp(escapeBackground, sequence.escapeOpacity * .7);
      (scene.fog as THREE.FogExp2).color.copy(crownFog).lerp(lowerFog, sequence.lowerBlend);
      escapeLight.visible = sequence.escapeOpacity > 0; escapeLight.position.y = sequence.actorY;
      recallPaint.opacity = sequence.escapeOpacity * .09; (recallRing.material as THREE.MeshBasicMaterial).opacity = sequence.escapeOpacity * .6;
      logosRig.update(presentationActive ? dt : 0, state, reducedMotion);
      const nextActive = latest.current.presentationActive !== false && !document.hidden;
      if (nextActive !== presentationActive) rebaselinePresentation();
      const incoming = eventFeed.read(state, presentationEpoch);
      if (state.time < lastTime) initializedCamera = false;
      lastTime = state.time;
      if (incoming.reset) clearPresentation();
      if (lastWireframe !== wireframe) {
        assets.materials.forEach(material => { if (material instanceof THREE.MeshStandardMaterial) material.wireframe = wireframe; });
        heroVisuals.forEach(visual => visual?.setWireframe(wireframe));
        logosRig.root.traverse(object => {
          if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material instanceof THREE.MeshStandardMaterial) material.wireframe = wireframe;
          }
        });
        lastWireframe = wireframe;
      }
      for (const event of presentationActive ? incoming.events : []) {
        const source = typeof event.actor === 'number' ? event.actor : -1;
        const actorAlive = state.party[source]?.hp > 0;
        if (actorAlive || event.kind === 'down') heroVisuals[source]?.playCombat(event);
        // Gesture suppression must not move contact earlier than its sound.
        // Fallback/scaffold heroes use the same presentation schedule.
        const visualDelay = actorAlive ? presentationContact(event, state.party[source]?.id) : 0;
        const delay = immediateImpact(event) ? 0 : visualDelay;
        const hitEnemy = event.enemyId ? state.enemies.find(e=>e.id===event.enemyId) : undefined;
        abilityEffects.start(event, hitEnemy ? { ...state, boss: { ...state.boss, x: hitEnemy.x, z: hitEnemy.z } } : state, delay);
        cinema.start(event, state, delay);
        if (source >= 0 && rigs[source] && ['auto', 'weapon', 'magic', 'burst'].includes(event.kind)) rigs[source].attack = 1;
        if (delay > 0 && !immediateImpact(event)) {
          if (pendingImpacts.length >= effects.length) pendingImpacts.shift();
          pendingImpacts.push({ event, at: animationTime + delay });
        }
        else spawnEffect(event, state);
      }
      for (let i = 0; i < rigs.length; i++) {
        const actor = state.party[i], rig = rigs[i];
        if (!actor) continue;
        const beforeX = rig.root.position.x, beforeZ = rig.root.position.z;
        rig.root.position.y = sequence.actorY;
        rig.root.position.x = THREE.MathUtils.damp(beforeX, actor.x, 16, dt);
        rig.root.position.z = THREE.MathUtils.damp(beforeZ, actor.z, 16, dt);
        let difference = Math.atan2(Math.sin(actor.facing - rig.root.rotation.y), Math.cos(actor.facing - rig.root.rotation.y));
        difference *= 1 - Math.exp(-15 * dt); rig.root.rotation.y += difference;
        const speed = Math.hypot(rig.root.position.x - beforeX, rig.root.position.z - beforeZ) / dt;
        const visual = heroVisuals[i];
        rig.root.scale.setScalar(actor.sonOfZeus ? 2 : 1);
        rig.body.visible = !visual;
        rig.ornament.visible = !visual;
        if (visual) { visual.object.visible = true; visual.setDivineForm?.(actor.sonOfZeus); }
        if (visual) {
          rig.attack = Math.max(0, rig.attack - dt * 2.5);
          visual.update(dt, speed, actor.hp > 0, rig.attack);
        } else animateActor(rig, dt, now / 1000, speed, actor.hp > 0);
        partyMarkers[i].update(actor, i === slot);
        const cues = statusCues[i], status = actorStatusFeedback(actor, selectedAlly === i);
        cues.shield.visible = status.shielded;
        cues.weave.visible = status.rapidWeave;
        cues.selected.visible = status.selected;
        cues.gems.forEach(gem => { gem.mesh.visible = (actor.rapidWeave?.charges[gem.element] ?? 0) > 0; });
      }
      bossRig.root.position.x = THREE.MathUtils.damp(bossRig.root.position.x, state.boss.x, 9, dt);
      bossRig.root.position.z = THREE.MathUtils.damp(bossRig.root.position.z, state.boss.z, 9, dt);
      bossRig.root.rotation.y += Math.atan2(Math.sin(state.boss.facing - bossRig.root.rotation.y), Math.cos(state.boss.facing - bossRig.root.rotation.y)) * (1 - Math.exp(-5 * dt));
      animateActor(bossRig, dt, now / 1000, 0, state.boss.hp > 0, Boolean(state.boss.cast));
      bossRig.root.visible = state.encounter !== 'logos';
      divine.update(presentationActive ? dt : 0, state, animationTime, reducedMotion);
      if (targetPulse !== lastTargetPulse || selectedTarget !== lastSelectedTarget) {
        targetPulseAge = 0; lastTargetPulse = targetPulse; lastSelectedTarget = selectedTarget;
      }
      targetPulseAge += dt;
      const pulse = Math.max(0, 1 - targetPulseAge / .5);
      const lockedTarget = !sequenceLocked(state) && cameraLockTarget(state, slot) ? offensiveTarget(state, selected) : null;
      const attackTarget = offensiveTarget(state, selected);
      const selectedEnemy = state.enemies.find(enemy => enemy.id === selectedTarget && enemy.hp > 0);
      const target = selectedEnemy ?? attackTarget;
      const targetId = 'id' in target ? target.id : 'boss';
      const bossSelected = state.encounter === 'logos' ? !sequenceLocked(state) && !!(selectedTarget || lockedTarget) && target.hp > 0 : (selectedTarget === 'boss' || !!lockedTarget) && state.boss.hp > 0;
      targetRing.position.set(target.x, .045, target.z);
      targetRing.visible = targetReticle.visible = bossSelected;
      targetRing.scale.setScalar(1 + (reducedMotion ? 0 : pulse * .18));
      targetMaterial.color.setRGB(.86 + pulse * .14, .69 + pulse * .31, .4 + pulse * .6);
      targetMaterial.opacity = .65 + pulse * .35;
      const targetAnchor = state.encounter === 'logos' ? logosRig.targets.get(targetId) : undefined;
      if (targetAnchor) { targetAnchor.getWorldPosition(targetWorld); targetReticle.position.copy(targetWorld); }
      else targetReticle.position.set(bossRig.root.position.x, 3.8, bossRig.root.position.z);
      targetReticle.scale.setScalar(1 + (reducedMotion ? 0 : pulse * .5));
      reticleMaterial.color.copy(targetMaterial.color); reticleMaterial.opacity = .75 + pulse * .25;
      const burst = activeBurst(state);
      burstRing.visible = !sequenceLocked(state) && (!!burst || state.duskRemaining > 0);
      if (burst || state.duskRemaining > 0) {
        burstRing.position.set(target.x, .07, target.z);
        burstMaterial.color.set(state.duskRemaining > 0 ? '#e2a5ff' : MAGIC[burst!.element].color);
        burstRing.geometry.setDrawRange(0, Math.max(1, Math.ceil(128 * Math.min(1, state.duskRemaining > 0 ? state.duskRemaining / 10 : burst!.remaining / BURST_WINDOW))) * 6);
        reticleMaterial.color.copy(burstMaterial.color);
      }

      const cast = state.boss.cast, warning = bossWarning(state);
      circleWarn.visible = Boolean(warning && warning.kind !== 'cone' && warning.kind !== 'target'); coneWarn.visible = warning?.kind === 'cone';
      warningEdge.visible = circleWarn.visible;
      decreeMark.visible = decreeStem.visible = warning?.kind === 'target';
      echoEdge.visible = warning?.kind === 'raid' && warning.pulses > 1;
      if (cast && warning) {
        const radius = warning.kind === 'raid' ? ARENA_RADIUS : warning.radius;
        const { x, z } = warning;
        circleWarn.position.set(x, .055, z); circleWarn.scale.set(radius, radius, 1);
        coneWarn.position.set(cast.x, .055, cast.z); coneWarn.scale.set(cast.radius, 1, cast.radius); coneWarn.rotation.y = cast.angle;
        warningEdge.position.set(x, .06, z); warningEdge.scale.setScalar(radius);
        echoEdge.position.set(x, .065, z); echoEdge.scale.setScalar(Math.max(0, radius - .35));
        warnMaterial.opacity = .15 + .15 * warning.progress + (reducedMotion ? 0 : Math.sin(now * .008) * .035);
        warnMaterial.color.set(cast.kind === 'raid' ? '#9994ff' : '#f4a575');
        (warningEdge.material as THREE.MeshBasicMaterial).color.set(cast.kind === 'raid' ? '#b5b0ff' : '#ffc28a');
        if (warning.kind === 'target') {
          const target = rigs[warning.target].root.position;
          const height = (heroVisuals[warning.target]?.labelHeight ?? 2.4) + .65;
          decreeMark.position.set(target.x, height, target.z);
          decreeStem.position.set(target.x, height - .7, target.z);
          decreeMaterial.opacity = .6 + warning.progress * .4;
        }
      }
      for (let i = pendingImpacts.length - 1; i >= 0; i--) {
        const impact = pendingImpacts[i];
        if (impact.at > animationTime) continue;
        if (typeof impact.event.actor === 'number' && state.party[impact.event.actor]?.hp > 0) spawnEffect(impact.event, state);
        pendingImpacts.splice(i, 1);
      }
      for (const effect of effects) {
        if (effect.life <= 0) continue;
        effect.life = Math.max(0, effect.life - dt); const progress = 1 - effect.life / effect.duration;
        effect.root.visible = effect.life > 0;
        effect.ring.scale.setScalar((reducedMotion ? .85 : effect.calm ? .8 + progress * .2 : .25 + progress) * effect.size);
        effect.ring.material.opacity = (1 - progress) * (effect.calm ? .55 : .85);
        effect.beam.visible = effect.beam.visible && (effect.calm || progress < .28);
      }
      // Engaging locks the view toward the living enemy; disengaging leaves this
      // heading in place for free orbit. Input reads the same yaw for movement.
      const orbit = cameraState ?? fallbackCamera;
      trackCameraTarget(orbit, rigs[slot].root.position, lockedTarget, dt);
      const pose = calculateCameraPose(orbit, rigs[slot].root.position, cameraHeight, shoulderOffset);
      cameraPosition.set(pose.position.x, pose.position.y, pose.position.z);
      cameraLook.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
      cameraPosition.y += sequence.actorY; cameraLook.y += sequence.actorY;
      if (state.encounter === 'logos' && state.logos.stage === 'giant' && lockedTarget === state.boss) {
        logosRig.targets.get('boss')?.getWorldPosition(targetWorld); cameraLook.lerp(targetWorld, .35);
      }
      if (!initializedCamera) { camera.position.copy(cameraPosition); smoothedLook.copy(cameraLook); initializedCamera = true; }
      else { camera.position.lerp(cameraPosition, 1 - Math.exp(-7 * dt)); smoothedLook.lerp(cameraLook, 1 - Math.exp(-9 * dt)); }
      camera.lookAt(smoothedLook);
      camera.updateMatrixWorld();
      targetReticle.quaternion.copy(camera.quaternion);
      decreeMark.quaternion.copy(camera.quaternion);
      numbers.update(dt, camera, size.x, size.y, reducedMotion);
      for (let i = 0; i < rigs.length; i++) {
        const label = labelRefs.current[i]; if (!label) continue;
        projected.copy(rigs[i].root.position);
        projected.y += (heroVisuals[i]?.labelHeight ?? (i === slot ? 2.5 : 2.75)) * (state.party[i].sonOfZeus ? 2 : 1);
        ray.copy(projected).sub(camera.position); const inFront = ray.dot(camera.getWorldDirection(beamDirection)) > 0;
        projected.project(camera);
        const visible = inFront && projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15 && state.party[i]?.hp > 0;
        label.style.opacity = visible ? (i === slot ? '.55' : '.9') : '0';
        label.style.transform = `translate3d(${(projected.x * .5 + .5) * size.x}px,${(-projected.y * .5 + .5) * size.y}px,0) translate(-50%,-100%)`;
      }
      if (presentationActive) {
        stormEffects.update(dt, state, reducedMotion);
        abilityEffects.update(dt, state, camera, reducedMotion);
        cinema.update(dt, state, camera, reducedMotion);
      }
      atmosphere.update(presentationActive ? dt : 0, state, reducedMotion, stormEffects.flash, sequence.floorOpacity);
      renderer.render(scene, camera); frames++;
      if (now - reportAt >= 1000) {
        const fps = Math.round(frames * 1000 / (now - reportAt));
        latest.current.onTelemetry?.({ fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
        const nextRatio = renderBudget.sample(fps, presentationActive);
        if (nextRatio !== null) { renderer.setPixelRatio(nextRatio); renderer.domElement.dataset.renderScale = String(nextRatio); resize(); }
        frames = 0; reportAt = now;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      stopped = true; cancelAnimationFrame(frame); observer.disconnect(); dockObserver.disconnect();
      motionPreference.removeEventListener('change', onMotionPreference); numbers.dispose(); stormEffects.dispose(); abilityEffects.dispose(); cinema.dispose(); atmosphere.dispose(); logosRig.dispose();
      document.removeEventListener('visibilitychange', rebaselinePresentation);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      // GLB instances/cache own their skeletons, textures and shared geometry.
      // Detach them before generic arena cleanup to avoid disposing them twice.
      heroVisuals.forEach(visual => { if (visual) { visual.object.removeFromParent(); visual.dispose(); } });
      heroCache.dispose();
      const geometries = new Set<THREE.BufferGeometry>(assets.geometries), materials = new Set<THREE.Material>(assets.materials);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      key.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  // Visual preferences rebuild the scene; simulation snapshots are read through latest.
  }, [props.quality, props.characterStyle]);

  return <div ref={hostRef} className="quantum-scene" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000000' }}>
    {props.state.party.map((actor, index) => {
      return <div className="party-world-label" key={actor.id} ref={element => { labelRefs.current[index] = element; }} style={labelStyle}>
        <span style={{ color: actor.color }}><Icon name={roleIcon(actor.role)} className="label-sigil"/>{actor.name}</span>
      </div>;
    })}
    {error && <div role="alert" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 46, maxWidth: 'min(560px,calc(100% - 24px))', padding: '10px 14px', border: '1px solid #a58e66', borderRadius: 6, background: '#111a2bf5', color: '#eee8d9', font: '11px/1.6 Arial,sans-serif', pointerEvents: 'none' }}>{error}</div>}
  </div>;
}
