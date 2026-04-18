import { describe, it, expect } from 'vitest';
import { findExtremaCandidates, pickWithMinSeparation, toroidalChebyshev } from './feature-points';

describe('findExtremaCandidates', () => {
  it('finds a single maximum on a smooth bump field', () => {
    // Bump centered at (0.5, 0.5); max is well away from grid edges.
    const h = (u: number, v: number) => {
      const du = u - 0.5, dv = v - 0.5;
      return Math.exp(-20 * (du*du + dv*dv));
    };
    const cands = findExtremaCandidates(h, 32);
    expect(cands.length).toBeGreaterThan(0);
    const top = cands[0]!;
    // Highest-score candidate should be near the bump center.
    expect(Math.abs(top.u - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(top.v - 0.5)).toBeLessThan(0.05);
    expect(top.score).toBeGreaterThan(0.9);
  });

  it('finds both maxima and minima (score is |h|)', () => {
    // Field: +1 near (0.25,0.25), -1 near (0.75,0.75).
    const h = (u: number, v: number) => {
      const du1 = u - 0.25, dv1 = v - 0.25;
      const du2 = u - 0.75, dv2 = v - 0.75;
      return Math.exp(-30 * (du1*du1 + dv1*dv1)) - Math.exp(-30 * (du2*du2 + dv2*dv2));
    };
    const cands = findExtremaCandidates(h, 32);
    const near = (cs: typeof cands, u: number, v: number, tol = 0.05) =>
      cs.some(c => Math.abs(c.u - u) < tol && Math.abs(c.v - v) < tol);
    expect(near(cands, 0.25, 0.25)).toBe(true);
    expect(near(cands, 0.75, 0.75)).toBe(true);
  });

  it('wraps periodically (extremum at grid edge is detected)', () => {
    // Max at u=0, v=0 — must be detected via periodic neighbors.
    const h = (u: number, v: number) => {
      const du = Math.min(u, 1 - u);
      const dv = Math.min(v, 1 - v);
      return Math.exp(-30 * (du*du + dv*dv));
    };
    const cands = findExtremaCandidates(h, 32);
    const gotEdge = cands.some(c =>
      (c.u < 0.05 || c.u > 0.95) && (c.v < 0.05 || c.v > 0.95));
    expect(gotEdge).toBe(true);
  });

  it('returns empty array on a flat field', () => {
    const cands = findExtremaCandidates(() => 0.42, 16);
    expect(cands.length).toBe(0);
  });

  it('candidates are sorted by descending score', () => {
    const h = (u: number, v: number) => {
      return 2 * Math.exp(-30 * ((u-0.3)**2 + (v-0.3)**2))
           + 1 * Math.exp(-30 * ((u-0.7)**2 + (v-0.7)**2));
    };
    const cands = findExtremaCandidates(h, 32);
    for (let i = 1; i < cands.length; i++) {
      expect(cands[i-1]!.score).toBeGreaterThanOrEqual(cands[i]!.score);
    }
  });
});

describe('toroidalChebyshev', () => {
  it('returns the direct distance when closer than wrap', () => {
    expect(toroidalChebyshev(0.1, 0.2, 0.1, 0.3)).toBeCloseTo(0.1, 9);
  });

  it('returns the wrapped distance when that is shorter', () => {
    // u wrap: 0.05 vs 0.95 direct=0.9, wrap=0.1
    expect(toroidalChebyshev(0.05, 0, 0.95, 0)).toBeCloseTo(0.1, 9);
  });

  it('symmetric in both arguments', () => {
    expect(toroidalChebyshev(0.05, 0.9, 0.95, 0.1))
      .toBeCloseTo(toroidalChebyshev(0.95, 0.1, 0.05, 0.9), 9);
  });
});

describe('pickWithMinSeparation', () => {
  const pts = [
    { u: 0.10, v: 0.10, score: 10 },
    { u: 0.15, v: 0.12, score: 9 },  // too close to first
    { u: 0.60, v: 0.50, score: 8 },
    { u: 0.30, v: 0.80, score: 7 },
    { u: 0.62, v: 0.52, score: 6 },  // too close to third
  ];

  it('picks top-N respecting min separation', () => {
    const out = pickWithMinSeparation(pts, 3, 0.1);
    expect(out.length).toBe(3);
    expect(out.map(p => p.score)).toEqual([10, 8, 7]);
  });

  it('returns fewer than N when separation cannot be satisfied', () => {
    const out = pickWithMinSeparation(pts, 5, 0.3);
    // With separation 0.3, we can only fit a subset.
    expect(out.length).toBeLessThan(5);
    // First pick always wins.
    expect(out[0]!.score).toBe(10);
  });

  it('respects periodic wrap when testing separation', () => {
    const near = [
      { u: 0.02, v: 0.5, score: 10 },
      { u: 0.98, v: 0.5, score: 9 }, // wrap distance 0.04, must be rejected at sep=0.1
    ];
    const out = pickWithMinSeparation(near, 2, 0.1);
    expect(out.length).toBe(1);
    expect(out[0]!.score).toBe(10);
  });
});
