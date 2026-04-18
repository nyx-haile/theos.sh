import { describe, it, expect } from 'vitest';
import { createPeriodicNoise } from './noise';
import { Xoshiro256 } from '../manifold/prng';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('periodic 4D-projected noise', () => {
  it('is deterministic from the seed', () => {
    const a = createPeriodicNoise(new Xoshiro256(seed(7)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    const b = createPeriodicNoise(new Xoshiro256(seed(7)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    expect(a.sample(0.2, 0.7)).toBeCloseTo(b.sample(0.2, 0.7), 12);
    expect(a.sample(0.9, 0.1)).toBeCloseTo(b.sample(0.9, 0.1), 12);
  });

  it('differs across seeds', () => {
    const a = createPeriodicNoise(new Xoshiro256(seed(1)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    const b = createPeriodicNoise(new Xoshiro256(seed(2)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    expect(a.sample(0.3, 0.3)).not.toBeCloseTo(b.sample(0.3, 0.3), 6);
  });

  it('is exactly periodic in u: h(0,v) === h(1,v)', () => {
    const n = createPeriodicNoise(new Xoshiro256(seed(3)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    for (const v of [0.0, 0.13, 0.4, 0.77, 0.99]) {
      expect(n.sample(0, v)).toBeCloseTo(n.sample(1, v), 12);
    }
  });

  it('is exactly periodic in v: h(u,0) === h(u,1)', () => {
    const n = createPeriodicNoise(new Xoshiro256(seed(5)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    for (const u of [0.0, 0.13, 0.4, 0.77, 0.99]) {
      expect(n.sample(u, 0)).toBeCloseTo(n.sample(u, 1), 12);
    }
  });

  it('output is bounded in [-1, 1]', () => {
    const n = createPeriodicNoise(new Xoshiro256(seed(11)), { octaves: 4, lacunarity: 2, gain: 0.5 });
    for (let i = 0; i < 100; i++) {
      const u = Math.random();
      const v = Math.random();
      const h = n.sample(u, v);
      expect(h).toBeGreaterThanOrEqual(-1);
      expect(h).toBeLessThanOrEqual(1);
    }
  });
});
