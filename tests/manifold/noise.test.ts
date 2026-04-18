import { describe, it, expect } from 'vitest';
import { createNoiseField } from '../../src/manifold/noise';
import { Xoshiro256 } from '../../src/manifold/prng';

function makePrng() {
  return new Xoshiro256(new Uint8Array(32).fill(1));
}

describe('createNoiseField', () => {
  it('returns values in [-1, 1]', () => {
    const field = createNoiseField(makePrng());
    for (let i = 0; i < 100; i++) {
      const v = field.sample(i * 0.1, i * 0.2, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same prng seed', () => {
    const a = createNoiseField(makePrng());
    const b = createNoiseField(makePrng());
    expect(a.sample(1, 2, 3)).toBe(b.sample(1, 2, 3));
  });

  it('produces different values at different positions', () => {
    const field = createNoiseField(makePrng());
    expect(field.sample(0, 0, 0)).not.toBe(field.sample(10, 0, 0));
  });

  it('octave count produces valid values', () => {
    const field = createNoiseField(makePrng());
    const v1 = field.sample(1, 1, 1, 1);
    const v4 = field.sample(1, 1, 1, 4);
    expect(v1).toBeGreaterThanOrEqual(-1);
    expect(v1).toBeLessThanOrEqual(1);
    expect(v4).toBeGreaterThanOrEqual(-1);
    expect(v4).toBeLessThanOrEqual(1);
  });
});
