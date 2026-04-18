import type { ManifoldBackend } from '../surface/types';

export interface GeoState {
  u: number;
  v: number;
  uDot: number;
  vDot: number;
}

/** √(g(X, X)) — metric-induced length of a parameter-space vector X = (x, y). */
export function metricNorm(guu: number, guv: number, gvv: number, x: number, y: number): number {
  const sq = guu * x * x + 2 * guv * x * y + gvv * y * y;
  return Math.sqrt(Math.max(sq, 0));
}

/** Acceleration from the geodesic equation: ü^k = −Γ^k_{ij} u̇^i u̇^j.
 *  christoffelAt order: [Γᵘᵤᵤ, Γᵘᵤᵥ, Γᵘᵥᵥ, Γᵛᵤᵤ, Γᵛᵤᵥ, Γᵛᵥᵥ]. */
export function geodesicAccel(
  m: ManifoldBackend,
  u: number,
  v: number,
  uDot: number,
  vDot: number,
): [number, number] {
  const c = m.christoffelAt(u, v);
  const Guuu = c[0], Guuv = c[1], Guvv = c[2];
  const Gvuu = c[3], Gvuv = c[4], Gvvv = c[5];
  const uu = uDot * uDot;
  const uv = uDot * vDot;
  const vv = vDot * vDot;
  const aU = -(Guuu * uu + 2 * Guuv * uv + Guvv * vv);
  const aV = -(Gvuu * uu + 2 * Gvuv * uv + Gvvv * vv);
  return [aU, aV];
}

/** Advance a geodesic by arc-length ds using N midpoint-method substeps.
 *  The input velocity (uDot, vDot) is expected to be unit-speed in the
 *  current metric (i.e. √(g(v,v)) = 1); under exact integration the norm is
 *  conserved along the geodesic so the output velocity is also unit. */
export function geodesicStep(
  m: ManifoldBackend,
  state: GeoState,
  ds: number,
  substeps: number,
): GeoState {
  let { u, v, uDot, vDot } = state;
  const h = ds / substeps;
  for (let s = 0; s < substeps; s++) {
    const [aU1, aV1] = geodesicAccel(m, u, v, uDot, vDot);
    const uM = u + 0.5 * h * uDot;
    const vM = v + 0.5 * h * vDot;
    const uDotM = uDot + 0.5 * h * aU1;
    const vDotM = vDot + 0.5 * h * aV1;
    const [aU2, aV2] = geodesicAccel(m, uM, vM, uDotM, vDotM);
    u += h * uDotM;
    v += h * vDotM;
    uDot += h * aU2;
    vDot += h * aV2;
  }
  return { u, v, uDot, vDot };
}
