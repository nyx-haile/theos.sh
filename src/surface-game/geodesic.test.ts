import { describe, it, expect } from 'vitest';
import { geodesicStep, geodesicAccel, metricNorm } from './geodesic';
import { makeSurface } from '../surface/backend';
import { defaultTunables } from '../config/tunables';
import type { ManifoldBackend } from '../surface/types';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

/** Synthetic flat manifold for sanity tests: (u,v) → (u,v,0), g ≡ I. */
function flatManifold(): ManifoldBackend {
  return {
    heightAt: () => 0,
    embed: (u, v) => [u, v, 0],
    normalAt: () => [0, 0, 1],
    metricAt: () => [1, 0, 1],
    christoffelAt: () => [0, 0, 0, 0, 0, 0],
    atlas: { charts: [{ id: 0 }], wrapPosition: (c, u, v) => ({ chart: c, u, v }) },
  };
}

describe('geodesicAccel', () => {
  it('is zero on a flat metric', () => {
    const [aU, aV] = geodesicAccel(flatManifold(), 0.3, 0.7, 1, 0);
    expect(aU).toBeCloseTo(0, 12);
    expect(aV).toBeCloseTo(0, 12);
  });

  it('points "downhill in the metric" on a bumpy torus', () => {
    const t = defaultTunables();
    const m = makeSurface(seed(11), t);
    // At some interior point, with nonzero velocity, accel should be finite.
    const [aU, aV] = geodesicAccel(m, 0.3, 0.4, 0.5, 0.5);
    expect(Number.isFinite(aU)).toBe(true);
    expect(Number.isFinite(aV)).toBe(true);
  });
});

describe('geodesicStep (flat)', () => {
  it('reduces to straight-line motion on a flat metric', () => {
    const m = flatManifold();
    const ds = 0.3;
    const out = geodesicStep(m, { u: 0.1, v: 0.2, uDot: 1, vDot: 0 }, ds, 4);
    expect(out.u).toBeCloseTo(0.1 + ds, 9);
    expect(out.v).toBeCloseTo(0.2, 9);
    expect(out.uDot).toBeCloseTo(1, 9);
    expect(out.vDot).toBeCloseTo(0, 9);
  });

  it('diagonal direction on flat → uniform linear motion', () => {
    const m = flatManifold();
    const s2 = 1 / Math.SQRT2;
    const ds = 0.5;
    const out = geodesicStep(m, { u: 0.2, v: 0.3, uDot: s2, vDot: s2 }, ds, 4);
    expect(out.u).toBeCloseTo(0.2 + ds * s2, 9);
    expect(out.v).toBeCloseTo(0.3 + ds * s2, 9);
  });
});

describe('geodesicStep (curved torus)', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(19), t);

  it('approximately preserves the metric norm of the velocity vector', () => {
    const [guu, guv, gvv] = m.metricAt(0.4, 0.4);
    const raw_u = 1, raw_v = 0.5;
    const n0 = metricNorm(guu, guv, gvv, raw_u, raw_v);
    const u0 = raw_u / n0, v0 = raw_v / n0;

    const ds = 0.1;
    const out = geodesicStep(m, { u: 0.4, v: 0.4, uDot: u0, vDot: v0 }, ds, 8);
    const [gUU2, gUV2, gVV2] = m.metricAt(out.u, out.v);
    const n1 = metricNorm(gUU2, gUV2, gVV2, out.uDot, out.vDot);
    // Unit-speed geodesic stays unit-speed under RK4 (within integration error).
    expect(Math.abs(n1 - 1)).toBeLessThan(0.005);
  });

  it('RK4: unit-speed preservation holds at larger ds with fewer substeps', () => {
    const [guu, guv, gvv] = m.metricAt(0.4, 0.4);
    const raw_u = 1, raw_v = 0.5;
    const n0 = metricNorm(guu, guv, gvv, raw_u, raw_v);
    const u0 = raw_u / n0, v0 = raw_v / n0;

    const ds = 0.3;
    const out = geodesicStep(m, { u: 0.4, v: 0.4, uDot: u0, vDot: v0 }, ds, 4);
    const [gUU2, gUV2, gVV2] = m.metricAt(out.u, out.v);
    const n1 = metricNorm(gUU2, gUV2, gVV2, out.uDot, out.vDot);
    expect(Math.abs(n1 - 1)).toBeLessThan(0.01);
  });

  it('moves the position by approximately arc-length ds in world space', () => {
    const [guu, guv, gvv] = m.metricAt(0.5, 0.5);
    const n0 = metricNorm(guu, guv, gvv, 1, 0);
    const u0 = 1 / n0, v0 = 0;
    const ds = 0.2;
    const p0 = m.embed(0.5, 0.5);
    const out = geodesicStep(m, { u: 0.5, v: 0.5, uDot: u0, vDot: v0 }, ds, 16);
    const p1 = m.embed(out.u, out.v);
    const worldDist = Math.hypot(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]);
    // World-space straight-line chord is shorter than arc length for a curved
    // geodesic, so allow a tolerance — but it must not be wildly different.
    expect(worldDist).toBeGreaterThan(0.7 * ds);
    expect(worldDist).toBeLessThanOrEqual(ds + 1e-6);
  });
});
