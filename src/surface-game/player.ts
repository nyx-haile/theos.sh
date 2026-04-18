import type { ManifoldBackend, Vec3 } from '../surface/types';
import type { Player, Pose } from './types';
import type { TunablesShape } from '../config/tunables';
import { makePose } from './types';

export interface KeyState {
  w: boolean; a: boolean; s: boolean; d: boolean;
  q: boolean; e: boolean; r: boolean; f: boolean;
}

const EMPTY_KEYS: KeyState = { w: false, a: false, s: false, d: false, q: false, e: false, r: false, f: false };

export function applyKeys(partial: Partial<KeyState>): KeyState {
  return { ...EMPTY_KEYS, ...partial };
}

export function createPlayer(u = 0.5, v = 0.5, yaw = 0, pitch = -0.3): Player {
  return { pose: makePose(u, v, yaw, pitch) };
}

function wrapYaw(y: number): number {
  const pi = Math.PI, tau = 2 * pi;
  let w = ((y + pi) % tau + tau) % tau - pi;
  return w;
}

function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }

/** Project a world-space step back onto (u, v) via the surface tangent basis.
 * C1 naive walking: we take the step as a linear combination of the tangent vectors
 * at (u, v) with coefficients we pick so that the player moves ε·direction in the
 * tangent plane. The metric is not inverted here — this is the "parameter-speed"
 * approximation that C3 (bead theos.sh-3fk) replaces with geodesic integration. */
function tangentStep(m: ManifoldBackend, pose: Pose, world: Vec3): { du: number; dv: number } {
  const eps = 1e-4;
  const p = m.embed(pose.u, pose.v);
  const pU = m.embed(pose.u + eps, pose.v);
  const pV = m.embed(pose.u, pose.v + eps);
  // Tangent vectors scaled to parameter-space (per unit Δu / Δv).
  const tU: Vec3 = [(pU[0]-p[0])/eps, (pU[1]-p[1])/eps, (pU[2]-p[2])/eps];
  const tV: Vec3 = [(pV[0]-p[0])/eps, (pV[1]-p[1])/eps, (pV[2]-p[2])/eps];
  // Gram matrix for 2x2 solve: [tU·tU, tU·tV; tU·tV, tV·tV] [du; dv] = [tU·world; tV·world].
  const a = tU[0]*tU[0] + tU[1]*tU[1] + tU[2]*tU[2];
  const c = tU[0]*tV[0] + tU[1]*tV[1] + tU[2]*tV[2];
  const b = tV[0]*tV[0] + tV[1]*tV[1] + tV[2]*tV[2];
  const rU = tU[0]*world[0] + tU[1]*world[1] + tU[2]*world[2];
  const rV = tV[0]*world[0] + tV[1]*world[1] + tV[2]*world[2];
  const det = a*b - c*c || 1e-18;
  const du = ( b*rU - c*rV) / det;
  const dv = (-c*rU + a*rV) / det;
  return { du, dv };
}

export function stepPlayer(player: Player, m: ManifoldBackend, t: TunablesShape, keys: KeyState, dt: number): void {
  const pose = player.pose;

  // Yaw / pitch update first (affect the view direction used for W/S/A/D).
  if (keys.q) pose.yaw = wrapYaw(pose.yaw - t.walk.yawRate * dt);
  if (keys.e) pose.yaw = wrapYaw(pose.yaw + t.walk.yawRate * dt);
  const pitchClamp = (t.walk.pitchClampDeg * Math.PI) / 180;
  if (keys.r) pose.pitch = clamp(pose.pitch + t.walk.pitchRate * dt, -pitchClamp, pitchClamp);
  if (keys.f) pose.pitch = clamp(pose.pitch - t.walk.pitchRate * dt, -pitchClamp, pitchClamp);

  // Movement: build view-tangent forward/right in ℝ³, convert to (du, dv) via tangent-solve.
  const eps = 1e-4;
  const p = m.embed(pose.u, pose.v);
  const n = m.normalAt(pose.u, pose.v);
  const pU = m.embed(pose.u + eps, pose.v);
  let dU: Vec3 = [(pU[0]-p[0])/eps, (pU[1]-p[1])/eps, (pU[2]-p[2])/eps];
  const dUn = dU[0]*n[0] + dU[1]*n[1] + dU[2]*n[2];
  // Remove normal component → strictly tangent.
  dU = [dU[0] - dUn*n[0], dU[1] - dUn*n[1], dU[2] - dUn*n[2]];
  const dUmag = Math.sqrt(dU[0]**2 + dU[1]**2 + dU[2]**2) || 1;
  const tU: Vec3 = [dU[0]/dUmag, dU[1]/dUmag, dU[2]/dUmag];
  // Right = n × tU.
  const tR: Vec3 = [
    n[1]*tU[2] - n[2]*tU[1],
    n[2]*tU[0] - n[0]*tU[2],
    n[0]*tU[1] - n[1]*tU[0],
  ];
  const cosY = Math.cos(pose.yaw), sinY = Math.sin(pose.yaw);
  const fwd: Vec3 = [cosY*tU[0] + sinY*tR[0], cosY*tU[1] + sinY*tR[1], cosY*tU[2] + sinY*tR[2]];
  const right: Vec3 = [-sinY*tU[0] + cosY*tR[0], -sinY*tU[1] + cosY*tR[1], -sinY*tU[2] + cosY*tR[2]];

  const fStep = (keys.w ? 1 : 0) + (keys.s ? -1 : 0);
  const rStep = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);
  if (fStep !== 0 || rStep !== 0) {
    const world: Vec3 = [
      fwd[0]*t.walk.walkSpeed*dt*fStep + right[0]*t.walk.strafeSpeed*dt*rStep,
      fwd[1]*t.walk.walkSpeed*dt*fStep + right[1]*t.walk.strafeSpeed*dt*rStep,
      fwd[2]*t.walk.walkSpeed*dt*fStep + right[2]*t.walk.strafeSpeed*dt*rStep,
    ];
    const { du, dv } = tangentStep(m, pose, world);
    const wrapped = m.atlas.wrapPosition(pose.chart, pose.u + du, pose.v + dv);
    pose.chart = wrapped.chart;
    pose.u = wrapped.u;
    pose.v = wrapped.v;
  }
}
