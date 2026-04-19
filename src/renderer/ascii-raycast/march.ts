import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { TunablesShape } from '../../config/tunables';
import type { Ray } from './ray';

export interface TerrainHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** Signed distance to the *base* torus (analytic, O(1) — one sqrt, one atan2-free).
 * Positive = outside tube, negative = inside tube. */
function baseTorusSDF(p: Vec3, R: number, r: number): number {
  const rho = Math.sqrt(p[0]*p[0] + p[1]*p[1]);
  const dr = rho - R;
  return Math.sqrt(dr*dr + p[2]*p[2]) - r;
}

/** March the ray through ℝ³ until it hits the embedded bumpy surface, or give up.
 *
 * Two-phase trace:
 *  1. Coarse sphere-trace with analytic base-torus SDF. Steps by (base_sdf − A)
 *     which is a provably safe advance for a surface bounded ±A around the base.
 *  2. Fine parametric march with linear refinement at the crossing.
 */
export function marchTerrain(
  ray: Ray,
  m: ManifoldBackend,
  t: TunablesShape,
  heightSampler?: (u: number, v: number) => number,
): TerrainHit | null {
  const sampleH = heightSampler ?? ((u: number, v: number) => m.heightAt(u, v));
  const R = t.manifold.majorRadius;
  const r = t.manifold.minorRadius;
  const A = r * t.noise.amplitude;
  const fineStep = t.renderer.marchStepBase;
  const maxFineSteps = t.renderer.marchMaxSteps;
  const fineBand = A + fineStep;
  const boundR = R + r + A;

  const TAU = Math.PI * 2;

  function uFromXY(x: number, y: number): number {
    const u = ((Math.atan2(y, x) / TAU) + 1) % 1;
    return u;
  }
  function vFromPoint(x: number, y: number, z: number): number {
    const ringR = Math.sqrt(x*x + y*y);
    const v = ((Math.atan2(z, ringR - R) / TAU) + 1) % 1;
    return v;
  }

  let posX = ray.origin[0], posY = ray.origin[1], posZ = ray.origin[2];
  const dX = ray.direction[0], dY = ray.direction[1], dZ = ray.direction[2];
  let traveled = 0;

  // R2 coarse-rejection: ray vs bounding sphere of radius boundR at origin.
  // Rays that miss the enclosing sphere cannot touch the bumpy torus — return
  // null without marching. For rays that hit, advance to the sphere-entry t so
  // the adaptive loop skips empty free space. Direction is pre-normalized by
  // makeRays so |d|=1 and the quadratic reduces to t = -(p·d) ± √(…).
  {
    const pDotD = posX*dX + posY*dY + posZ*dZ;
    const pDotP = posX*posX + posY*posY + posZ*posZ;
    const disc = pDotD*pDotD - (pDotP - boundR*boundR);
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const tExit = -pDotD + sq;
    if (tExit < 0) return null;
    const tEnter = -pDotD - sq;
    if (tEnter > 0) {
      posX += dX * tEnter; posY += dY * tEnter; posZ += dZ * tEnter;
      traveled = tEnter;
    }
  }
  // Budget = sphere entry + one diameter through the sphere + slack.
  const farLimit = traveled + 2 * boundR + 1;

  // Combined sphere-trace + fine refine. Sphere-trace phase skips the
  // parametric signed-distance call entirely (base − A is a provably safe
  // stride and a safe lower-bound on true SDF). Fine phase is entered only
  // when base_sdf ≤ A + fineStep, i.e. we're within a step of the bumpy band.
  // Inline the base-torus SDF and cheap surface SDF to avoid Vec3 allocations.
  let rho = Math.sqrt(posX*posX + posY*posY);
  let dr = rho - R;
  let base = Math.sqrt(dr*dr + posZ*posZ) - r;
  let prevD: number;
  if (base > fineBand) {
    prevD = base - A;
  } else {
    const uAngle = Math.atan2(posY, posX);
    const vAngle = Math.atan2(posZ, rho - R);
    const u = ((uAngle / TAU) + 1) % 1;
    const v = ((vAngle / TAU) + 1) % 1;
    prevD = base - sampleH(u, v);
  }

  for (let s = 0; s < maxFineSteps; s++) {
    rho = Math.sqrt(posX*posX + posY*posY);
    dr = rho - R;
    base = Math.sqrt(dr*dr + posZ*posZ) - r;

    if (base > fineBand) {
      const stride = base - A;
      posX += dX * stride; posY += dY * stride; posZ += dZ * stride;
      traveled += stride;

      // Recompute prevD at the new position as the true signed distance,
      // not the stride we just took. stride is in units of ray-advance;
      // prevD must be a signed-distance-to-surface so the fine-phase
      // linear-refinement k = prevD / (prevD - d) is unit-consistent.
      const rho2 = Math.sqrt(posX*posX + posY*posY);
      const dr2 = rho2 - R;
      const base2 = Math.sqrt(dr2*dr2 + posZ*posZ) - r;
      if (base2 > fineBand) {
        prevD = base2 - A;
      } else {
        const uA = ((Math.atan2(posY, posX) / TAU) + 1) % 1;
        const vA = ((Math.atan2(posZ, rho2 - R) / TAU) + 1) % 1;
        prevD = base2 - sampleH(uA, vA);
      }

      if (traveled > farLimit) return null;
      continue;
    }

    // Fine phase.
    const nextX = posX + dX * fineStep, nextY = posY + dY * fineStep, nextZ = posZ + dZ * fineStep;
    const nRho = Math.sqrt(nextX*nextX + nextY*nextY);
    const nDr = nRho - R;
    const nBase = Math.sqrt(nDr*nDr + nextZ*nextZ) - r;
    const nUAngle = Math.atan2(nextY, nextX);
    const nVAngle = Math.atan2(nextZ, nRho - R);
    const nU = ((nUAngle / TAU) + 1) % 1;
    const nV = ((nVAngle / TAU) + 1) % 1;
    const d = nBase - sampleH(nU, nV);

    if (prevD > 0 && d <= 0) {
      const k = prevD / (prevD - d);
      const hX = posX + k * (nextX - posX);
      const hY = posY + k * (nextY - posY);
      const hZ = posZ + k * (nextZ - posZ);
      const u = uFromXY(hX, hY);
      const v = vFromPoint(hX, hY, hZ);
      const distance = traveled + k * fineStep;
      return { point: [hX, hY, hZ], normal: m.normalAt(u, v), distance };
    }
    prevD = d;
    posX = nextX; posY = nextY; posZ = nextZ;
    traveled += fineStep;
    if (traveled > farLimit) return null;
  }
  return null;
}
