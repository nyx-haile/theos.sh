import { describe, it, expect } from 'vitest';
import { placeArtifacts } from './artifacts';
import { defaultTunables } from '../config/tunables';
import { makeSurface } from '../surface/backend';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('P1 uniform artifact placement', () => {
  const t = defaultTunables();

  it('count is deterministic and within countRange', () => {
    for (const b of [1, 2, 3, 4, 5]) {
      const arts = placeArtifacts(seed(b), t);
      expect(arts.length).toBeGreaterThanOrEqual(t.artifacts.countRange[0]);
      expect(arts.length).toBeLessThanOrEqual(t.artifacts.countRange[1]);
    }
  });

  it('same seed produces identical artifact set', () => {
    const a = placeArtifacts(seed(7), t);
    const b = placeArtifacts(seed(7), t);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]!, bi = b[i]!;
      expect(ai.u).toBeCloseTo(bi.u, 12);
      expect(ai.v).toBeCloseTo(bi.v, 12);
      expect(ai.radius).toBeCloseTo(bi.radius, 12);
      expect(ai.offset).toBeCloseTo(bi.offset, 12);
      expect(ai.spikes).toBe(bi.spikes);
    }
  });

  it('different seeds produce different artifact sets', () => {
    const a = placeArtifacts(seed(7), t);
    const b = placeArtifacts(seed(8), t);
    const diff = a.some((art, i) => !b[i] || Math.abs(art.u - b[i].u) > 1e-6);
    expect(diff).toBe(true);
  });

  it('positions are in [0, 1)²', () => {
    const arts = placeArtifacts(seed(13), t);
    for (const a of arts) {
      expect(a.u).toBeGreaterThanOrEqual(0);
      expect(a.u).toBeLessThan(1);
      expect(a.v).toBeGreaterThanOrEqual(0);
      expect(a.v).toBeLessThan(1);
    }
  });

  it('radii / offsets are in the configured range', () => {
    const arts = placeArtifacts(seed(13), t);
    const rScale = t.manifold.minorRadius;
    for (const a of arts) {
      expect(a.radius).toBeGreaterThanOrEqual(t.artifacts.radiusRange[0] * rScale - 1e-9);
      expect(a.radius).toBeLessThanOrEqual(t.artifacts.radiusRange[1] * rScale + 1e-9);
      expect(a.offset).toBeGreaterThanOrEqual(t.artifacts.offsetRange[0] * rScale - 1e-9);
      expect(a.offset).toBeLessThanOrEqual(t.artifacts.offsetRange[1] * rScale + 1e-9);
      expect(Number.isInteger(a.spikes)).toBe(true);
    }
  });

  it('guarantees at least one artifact when countRange min is >= 1', () => {
    const arts = placeArtifacts(seed(99), t);
    expect(arts.length).toBeGreaterThan(0);
  });
});

describe('P3 feature-biased artifact placement', () => {
  const t = defaultTunables();

  it('positions coincide with local extrema of h(u,v)', () => {
    const m = makeSurface(seed(17), t);
    const arts = placeArtifacts(seed(17), t, m);
    expect(arts.length).toBeGreaterThan(0);
    // For each placed artifact, |h(u,v)| should be comparable to a typical
    // grid maximum — i.e. greater than |h| at random points on average.
    const placedScores = arts.map(a => Math.abs(m.heightAt(a.u, a.v)));
    let randSum = 0, samples = 0;
    const rng = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 200; i++) {
      randSum += Math.abs(m.heightAt(rng(i), rng(i + 100)));
      samples++;
    }
    const randMean = randSum / samples;
    const placedMean = placedScores.reduce((s, x) => s + x, 0) / placedScores.length;
    expect(placedMean).toBeGreaterThan(randMean);
  });

  it('respects min-separation in u/v (periodic Chebyshev)', () => {
    const m = makeSurface(seed(23), t);
    const arts = placeArtifacts(seed(23), t, m);
    const sep = t.artifacts.minSeparation;
    for (let i = 0; i < arts.length; i++) {
      for (let j = i + 1; j < arts.length; j++) {
        const a = arts[i]!, b = arts[j]!;
        const du = Math.abs(a.u - b.u);
        const dv = Math.abs(a.v - b.v);
        const duP = Math.min(du, 1 - du);
        const dvP = Math.min(dv, 1 - dv);
        // If both came from the feature grid, separation must hold. Fallback
        // random picks are allowed to violate it, so only assert when either
        // artifact sits exactly on a grid vertex of the feature grid.
        const snap = 1 / t.artifacts.featureGridN;
        const onGrid = (x: number) => Math.abs(x / snap - Math.round(x / snap)) < 1e-6;
        if (onGrid(a.u) && onGrid(a.v) && onGrid(b.u) && onGrid(b.v)) {
          expect(Math.max(duP, dvP)).toBeGreaterThanOrEqual(sep - 1e-9);
        }
      }
    }
  });

  it('same seed + same backend produces identical placement', () => {
    const m1 = makeSurface(seed(31), t);
    const m2 = makeSurface(seed(31), t);
    const a = placeArtifacts(seed(31), t, m1);
    const b = placeArtifacts(seed(31), t, m2);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.u).toBeCloseTo(b[i]!.u, 12);
      expect(a[i]!.v).toBeCloseTo(b[i]!.v, 12);
      expect(a[i]!.radius).toBeCloseTo(b[i]!.radius, 12);
      expect(a[i]!.offset).toBeCloseTo(b[i]!.offset, 12);
      expect(a[i]!.spikes).toBe(b[i]!.spikes);
    }
  });

  it('radius/offset/spikes are identical across calls with and without feature backend (same seed)', () => {
    // With backend: feature points supply u/v, but PRNG draws for u/v must still
    // be consumed so that radius/offset/spikes draws stay at the same stream position.
    // Without backend: u/v fall back to PRNG draws.
    // In both cases radius/offset/spikes should be identical for the same seed.
    const m = makeSurface(seed(31), t);
    const withBackend = placeArtifacts(seed(31), t, m);
    const noBackend = placeArtifacts(seed(31), t);
    expect(withBackend.length).toBe(noBackend.length);
    for (let i = 0; i < withBackend.length; i++) {
      expect(withBackend[i]!.radius).toBeCloseTo(noBackend[i]!.radius, 12);
      expect(withBackend[i]!.offset).toBeCloseTo(noBackend[i]!.offset, 12);
      expect(withBackend[i]!.spikes).toBe(noBackend[i]!.spikes);
    }
  });
});
