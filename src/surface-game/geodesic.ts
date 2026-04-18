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

/** Advance a geodesic by arc-length ds using N RK4 substeps.
 *  The input velocity (uDot, vDot) is expected to be unit-speed in the
 *  current metric (i.e. √(g(v,v)) = 1); under exact integration the norm is
 *  conserved along the geodesic so the output velocity is also unit.
 *  RK4 gives O(h⁴) local truncation error (four accel evaluations per substep). */
export function geodesicStep(
  m: ManifoldBackend,
  state: GeoState,
  ds: number,
  substeps: number,
): GeoState {
  let { u, v, uDot, vDot } = state;
  const h = ds / substeps;
  for (let s = 0; s < substeps; s++) {
    // k1: derivative at current state
    const k1_u    = uDot;
    const k1_v    = vDot;
    const [k1_udot, k1_vdot] = geodesicAccel(m, u, v, uDot, vDot);

    // k2: derivative at midpoint using k1
    const u2    = u    + 0.5 * h * k1_u;
    const v2    = v    + 0.5 * h * k1_v;
    const uDot2 = uDot + 0.5 * h * k1_udot;
    const vDot2 = vDot + 0.5 * h * k1_vdot;
    const k2_u    = uDot2;
    const k2_v    = vDot2;
    const [k2_udot, k2_vdot] = geodesicAccel(m, u2, v2, uDot2, vDot2);

    // k3: derivative at midpoint using k2
    const u3    = u    + 0.5 * h * k2_u;
    const v3    = v    + 0.5 * h * k2_v;
    const uDot3 = uDot + 0.5 * h * k2_udot;
    const vDot3 = vDot + 0.5 * h * k2_vdot;
    const k3_u    = uDot3;
    const k3_v    = vDot3;
    const [k3_udot, k3_vdot] = geodesicAccel(m, u3, v3, uDot3, vDot3);

    // k4: derivative at endpoint using k3
    const u4    = u    + h * k3_u;
    const v4    = v    + h * k3_v;
    const uDot4 = uDot + h * k3_udot;
    const vDot4 = vDot + h * k3_vdot;
    const k4_u    = uDot4;
    const k4_v    = vDot4;
    const [k4_udot, k4_vdot] = geodesicAccel(m, u4, v4, uDot4, vDot4);

    // Combine with RK4 weights: 1/6, 2/6, 2/6, 1/6
    u    += (h / 6) * (k1_u    + 2 * k2_u    + 2 * k3_u    + k4_u);
    v    += (h / 6) * (k1_v    + 2 * k2_v    + 2 * k3_v    + k4_v);
    uDot += (h / 6) * (k1_udot + 2 * k2_udot + 2 * k3_udot + k4_udot);
    vDot += (h / 6) * (k1_vdot + 2 * k2_vdot + 2 * k3_vdot + k4_vdot);
  }
  return { u, v, uDot, vDot };
}
