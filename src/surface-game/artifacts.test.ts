import { describe, it, expect } from 'vitest';
import { placeArtifacts } from './artifacts';
import { defaultTunables } from '../config/tunables';

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
