import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { TunablesShape } from '../../config/tunables';
import type { Ray } from './ray';

export interface TerrainHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** March the ray through ℝ³ until it hits the embedded surface, or give up.
 * Uses analytic embed/normal. Coarse height-grid rejection (R2) lands in a follow-up. */
export function marchTerrain(
  ray: Ray,
  m: ManifoldBackend,
  t: TunablesShape,
): TerrainHit | null {
  const step = t.renderer.marchStepBase;
  const maxSteps = t.renderer.marchMaxSteps;

  // Nearest (u, v) to a ℝ³ point on the bumpy torus: invert the base-torus parametrization.
  // Reasonable approximation for small amplitude A — good enough for a hit test.
  function uvFromPoint(p: Vec3): { u: number; v: number } {
    const R = t.manifold.majorRadius;
    const uAngle = Math.atan2(p[1], p[0]);
    const ringR = Math.sqrt(p[0]*p[0] + p[1]*p[1]);
    const vAngle = Math.atan2(p[2], ringR - R);
    const TAU = Math.PI * 2;
    const u = ((uAngle / TAU) + 1) % 1;
    const v = ((vAngle / TAU) + 1) % 1;
    return { u, v };
  }

  function signedDistanceToSurface(p: Vec3): number {
    // Positive = above surface (outside), negative = below surface (inside).
    const { u, v } = uvFromPoint(p);
    const surfacePoint = m.embed(u, v);
    const n = m.normalAt(u, v);
    const dx = p[0] - surfacePoint[0];
    const dy = p[1] - surfacePoint[1];
    const dz = p[2] - surfacePoint[2];
    return dx*n[0] + dy*n[1] + dz*n[2];
  }

  let prevD = signedDistanceToSurface(ray.origin);
  let pos: Vec3 = [ray.origin[0], ray.origin[1], ray.origin[2]];

  for (let s = 0; s < maxSteps; s++) {
    const next: Vec3 = [pos[0] + ray.direction[0]*step, pos[1] + ray.direction[1]*step, pos[2] + ray.direction[2]*step];
    const d = signedDistanceToSurface(next);
    if (prevD > 0 && d <= 0) {
      // Surface crossed — refine with linear interpolation between pos and next.
      const k = prevD / (prevD - d);
      const hit: Vec3 = [pos[0] + k*(next[0]-pos[0]), pos[1] + k*(next[1]-pos[1]), pos[2] + k*(next[2]-pos[2])];
      const { u, v } = uvFromPoint(hit);
      const distance = (s + k) * step;
      return { point: hit, normal: m.normalAt(u, v), distance };
    }
    prevD = d;
    pos = next;
  }
  return null;
}
