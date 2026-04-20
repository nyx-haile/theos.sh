import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { Pose, Viewport } from '../../surface-game/types';

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

function sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function scale(a: Vec3, k: number): Vec3 { return [a[0]*k, a[1]*k, a[2]*k]; }
function add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function norm(a: Vec3): Vec3 {
  const m = Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]) || 1;
  return [a[0]/m, a[1]/m, a[2]/m];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

export function makeRays(m: ManifoldBackend, pose: Pose, vp: Viewport, eyeOffset: number): Ray[] {
  const eps = 1e-4;
  const p = m.embed(pose.u, pose.v);
  const n = m.normalAt(pose.u, pose.v);
  const origin: Vec3 = [p[0] + eyeOffset*n[0], p[1] + eyeOffset*n[1], p[2] + eyeOffset*n[2]];

  // Build local tangent basis at (u, v): t_u along +u, t_v along +v, re-orthonormalized against n.
  const pU = m.embed(pose.u + eps, pose.v);
  const dU = norm(sub(pU, p));
  // Make dU strictly tangent (remove any component along n).
  const dUn = dU[0]*n[0]+dU[1]*n[1]+dU[2]*n[2];
  const tU = norm(sub(dU, scale(n, dUn)));
  const tV = norm(cross(tU, n));  // screen-right at yaw=0 (forward × up)

  // View forward in tangent plane from yaw, then pitch toward n.
  const cosY = Math.cos(pose.yaw), sinY = Math.sin(pose.yaw);
  const fwdTan: Vec3 = [
    cosY*tU[0] + sinY*tV[0],
    cosY*tU[1] + sinY*tV[1],
    cosY*tU[2] + sinY*tV[2],
  ];
  const cosP = Math.cos(pose.pitch), sinP = Math.sin(pose.pitch);
  const fwd: Vec3 = norm([
    cosP*fwdTan[0] + sinP*n[0],
    cosP*fwdTan[1] + sinP*n[1],
    cosP*fwdTan[2] + sinP*n[2],
  ]);
  // Right vector is perpendicular to fwd. Anchor to world-up on the upper
  // hemisphere (n·ẑ > 0) so the world horizon renders level; smoothly fall
  // back to surface-normal reference as the player crosses to the underside,
  // where world-up would flip the camera. Guards against refUp ∥ fwd
  // (looking straight up/down) by reverting to the surface-normal basis.
  const worldUp: Vec3 = [0, 0, 1];
  const w = Math.max(0, Math.min(1, (n[2] - 0.2) / 0.5));
  const refUp: Vec3 = [(1 - w) * n[0], (1 - w) * n[1], (1 - w) * n[2] + w];
  const rcf = cross(fwd, refUp);
  const rcfMag = Math.hypot(rcf[0], rcf[1], rcf[2]);
  const right = rcfMag < 1e-3 ? norm(cross(fwd, n)) : norm(rcf);
  const up = norm(cross(right, fwd));

  const fovRad = (vp.fovDeg * Math.PI) / 180;
  const tanHalfH = Math.tan(fovRad / 2);
  const aspect = vp.cellsWide / vp.cellsHigh;
  // Character cells are typically ~2:1 tall; we fold that into a screen-space y compression
  // by using aspect as-is here and letting tanHalfW = tanHalfH * aspect * 0.5 to compensate.
  const tanHalfW = tanHalfH * aspect * 0.5;

  const rays: Ray[] = new Array(vp.cellsWide * vp.cellsHigh);
  for (let j = 0; j < vp.cellsHigh; j++) {
    const sy = ((vp.cellsHigh - 1 - j) + 0.5) / vp.cellsHigh * 2 - 1;
    for (let i = 0; i < vp.cellsWide; i++) {
      const sx = (i + 0.5) / vp.cellsWide * 2 - 1;
      const dir = norm(add(add(fwd, scale(right, sx * tanHalfW)), scale(up, sy * tanHalfH)));
      rays[j * vp.cellsWide + i] = { origin, direction: dir };
    }
  }
  return rays;
}
