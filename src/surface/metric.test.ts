import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('metric and christoffel consistency', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(17), t);

  it('metric is symmetric and positive-definite', () => {
    for (let i = 0; i < 30; i++) {
      const u = Math.random();
      const v = Math.random();
      const [guu, guv, gvv] = m.metricAt(u, v);
      // Positive definite: diagonal > 0, det > 0.
      expect(guu).toBeGreaterThan(0);
      expect(gvv).toBeGreaterThan(0);
      expect(guu * gvv - guv * guv).toBeGreaterThan(0);
    }
  });

  it('metric matches analytic base-torus metric when amplitude is zero', () => {
    const tFlat = { ...defaultTunables(), noise: { ...defaultTunables().noise, amplitude: 0 } };
    const mFlat = makeSurface(seed(17), tFlat);
    const R = tFlat.manifold.majorRadius;
    const r = tFlat.manifold.minorRadius;
    const TAU = Math.PI * 2;
    // Flat torus: g_uu = (TAU·(R + r·cos(TAU·v)))², g_vv = (TAU·r)², g_uv = 0.
    for (const [u, v] of [[0.0, 0.0], [0.25, 0.25], [0.5, 0.5]] as const) {
      const [guu, guv, gvv] = mFlat.metricAt(u, v);
      const ring = R + r * Math.cos(TAU * v);
      expect(guu).toBeCloseTo((TAU * ring) ** 2, 1);
      expect(gvv).toBeCloseTo((TAU * r) ** 2, 2);
      expect(Math.abs(guv)).toBeLessThan(0.05);
    }
  });

  it('christoffel symbols are finite everywhere in sampled domain', () => {
    for (let i = 0; i < 30; i++) {
      const u = Math.random();
      const v = Math.random();
      const c = m.christoffelAt(u, v);
      for (const x of c) {
        expect(Number.isFinite(x)).toBe(true);
      }
    }
  });
});
