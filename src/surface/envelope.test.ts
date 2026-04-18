import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

function dot(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

describe('B2 curvature envelope — normals are not wildly steep anywhere', () => {
  const t = defaultTunables();

  it('angular change between adjacent sample normals stays under maxNormalDeltaDeg * 3 for 20 seeds at default tunables', () => {
    const maxAllowedCos = Math.cos((t.envelope.maxNormalDeltaDeg * 3 * Math.PI) / 180);
    for (let b = 0; b < 20; b++) {
      const m = makeSurface(seed(b + 1), t);
      // Walk a dense line across the parameter space; check all adjacent-normal dot products.
      const steps = 128;
      let prev = m.normalAt(0, 0.5);
      let worstCos = 1;
      for (let i = 1; i <= steps; i++) {
        const n = m.normalAt(i / steps, 0.5);
        const c = Math.max(-1, Math.min(1, dot(prev, n)));
        worstCos = Math.min(worstCos, c);
        prev = n;
      }
      // We're not enforcing 10° per *step* because steps are much larger than ε; we enforce a
      // loose bound that catches runaway curvature (e.g. amplitude accidentally set to 10).
      expect(worstCos).toBeGreaterThan(maxAllowedCos);
    }
  });
});
