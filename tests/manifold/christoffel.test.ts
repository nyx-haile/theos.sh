import { describe, it, expect } from 'vitest';
import { computeMetricTensor, computeChristoffelSymbols } from '../../src/manifold/christoffel';
import { createNoiseField } from '../../src/manifold/noise';
import { Xoshiro256 } from '../../src/manifold/prng';
import type { GeodesicCoords } from '../../src/manifold/types';

function makeField() {
  return createNoiseField(new Xoshiro256(new Uint8Array(32).fill(3)));
}

describe('computeMetricTensor', () => {
  it('returns a 3×3 matrix', () => {
    const g = computeMetricTensor([0, 0, 0], makeField());
    expect(g.length).toBe(3);
    expect(g[0]!.length).toBe(3);
  });

  it('is close to identity at origin with small epsilon', () => {
    const g = computeMetricTensor([0, 0, 0], makeField());
    // diagonal elements should be near 1 (identity + small perturbation)
    for (let i = 0; i < 3; i++) {
      expect(g[i]![i]!).toBeGreaterThan(0.8);
      expect(g[i]![i]!).toBeLessThan(1.2);
    }
  });

  it('is deterministic', () => {
    const coords: GeodesicCoords = [1, 2, 3];
    const a = computeMetricTensor(coords, makeField());
    const b = computeMetricTensor(coords, makeField());
    expect(a).toEqual(b);
  });
});

describe('computeChristoffelSymbols', () => {
  it('returns a 3×3×3 array', () => {
    const G = computeChristoffelSymbols([0, 0, 0], makeField());
    expect(G.length).toBe(3);
    expect(G[0]!.length).toBe(3);
    expect(G[0]![0]!.length).toBe(3);
  });

  it('is symmetric in lower indices (Γ^μ_αβ = Γ^μ_βα)', () => {
    const G = computeChristoffelSymbols([1, 1, 1], makeField());
    for (let mu = 0; mu < 3; mu++) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          expect(G[mu]![a]![b]!).toBeCloseTo(G[mu]![b]![a]!, 5);
        }
      }
    }
  });
});
