/** Local presentation state. Orbit never changes actor facing or network state. */
export interface CameraState {
  yaw: number;
  pitch: number;
  distance: number;
}

export const CAMERA_DEFAULTS = { distance: 12, pitch: .36, height: 1.5, shoulderOffset: 0 } as const;
export const CAMERA_LIMITS = {
  minDistance: 4, maxDistance: 24,
  minPitch: .08, maxPitch: 1.25,
  minHeight: .2, maxHeight: 5,
  minShoulderOffset: -3, maxShoulderOffset: 3,
} as const;

export interface CameraPose {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
}

/** Projection-only clearance for an overlaid action dock. The scene supplies its
 * measured dock top and default-pose foot projection during resize, not per frame.
 * Existing camera controls and user orbit choices are untouched. */
export function calculateCameraViewOffset(viewportHeight: number, defaultFootY: number, dockTop: number): number {
  if (![viewportHeight, defaultFootY, dockTop].every(Number.isFinite) || viewportHeight <= 0) return 0;
  return Math.min(viewportHeight * .12, Math.max(0, defaultFootY - dockTop + 18));
}

const TAU = Math.PI * 2;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, finite(value, fallback)));
const wrapYaw = (yaw: number) => {
  const bounded = finite(yaw, 0) % TAU;
  return bounded > Math.PI ? bounded - TAU : bounded < -Math.PI ? bounded + TAU : bounded;
};
const distanceInRange = (distance: number) => clamp(distance, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance, CAMERA_DEFAULTS.distance);
const pitchInRange = (pitch: number) => clamp(pitch, CAMERA_LIMITS.minPitch, CAMERA_LIMITS.maxPitch, CAMERA_DEFAULTS.pitch);

export function createCamera(facing: number, distance: number = CAMERA_DEFAULTS.distance): CameraState {
  return { yaw: wrapYaw(facing), pitch: CAMERA_DEFAULTS.pitch, distance: distanceInRange(distance) };
}

/** Deltas are already signed radians. Negative dx looks right; negative dy looks up. */
export function orbitCamera(camera: CameraState, dx: number, dy: number): void {
  camera.yaw = wrapYaw(wrapYaw(camera.yaw) + wrapYaw(dx));
  camera.pitch = pitchInRange(pitchInRange(camera.pitch) + finite(dy, 0));
  camera.distance = distanceInRange(camera.distance);
}

/** Positive delta zooms out, in world units; negative delta zooms in. */
export function zoomCamera(camera: CameraState, delta: number): void {
  const distance = distanceInRange(camera.distance);
  // Clamp the delta before addition so even extreme finite input cannot overflow.
  camera.distance = distanceInRange(distance + clamp(delta, -CAMERA_LIMITS.maxDistance, CAMERA_LIMITS.maxDistance, 0));
}

export function recenterCamera(camera: CameraState, facing: number): void {
  camera.yaw = wrapYaw(facing);
  camera.pitch = CAMERA_DEFAULTS.pitch;
  camera.distance = distanceInRange(camera.distance);
}

/** Pure camera pose. Height is the orbit-anchor/look height. Positive shoulder is
 * screen-right, offsetting both endpoints for an over-the-shoulder composition.
 * The small forward lead keeps the controlled silhouette clear of the action dock.
 * Inputs are bounded locally; no mutation of camera or actor state occurs. */
export function calculateCameraPose(camera: CameraState, actor: { x: number; z: number }, height: number, shoulderOffset: number): CameraPose {
  const yaw = wrapYaw(camera.yaw), pitch = pitchInRange(camera.pitch), distance = distanceInRange(camera.distance);
  const anchorHeight = clamp(height, CAMERA_LIMITS.minHeight, CAMERA_LIMITS.maxHeight, CAMERA_DEFAULTS.height);
  const shoulder = clamp(shoulderOffset, CAMERA_LIMITS.minShoulderOffset, CAMERA_LIMITS.maxShoulderOffset, CAMERA_DEFAULTS.shoulderOffset);
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
  const rightX = -forwardZ, rightZ = forwardX;
  const x = finite(actor.x, 0) + rightX * shoulder, z = finite(actor.z, 0) + rightZ * shoulder;
  const horizontal = Math.cos(pitch) * distance;
  return {
    position: { x: x - forwardX * horizontal, y: anchorHeight + Math.sin(pitch) * distance, z: z - forwardZ * horizontal },
    lookAt: { x: x + forwardX * 2.2, y: anchorHeight, z: z + forwardZ * 2.2 },
  };
}
