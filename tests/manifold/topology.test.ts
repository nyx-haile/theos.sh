import { describe, it, expect } from 'vitest';
import { deriveTopology } from '../../src/manifold/topology';
import { Xoshiro256 } from '../../src/manifold/prng';

function makePrng(fill = 1) {
  return new Xoshiro256(new Uint8Array(32).fill(fill));
}

describe('deriveTopology', () => {
  it('genus is in [0, 3]', () => {
    for (let i = 0; i < 20; i++) {
      const t = deriveTopology(makePrng(i));
      expect(t.genus).toBeGreaterThanOrEqual(0);
      expect(t.genus).toBeLessThanOrEqual(3);
    }
  });

  it('has between 1 and 4 wormhole pairs', () => {
    for (let i = 0; i < 20; i++) {
      const t = deriveTopology(makePrng(i));
      expect(t.wormhole_pairs.length).toBeGreaterThanOrEqual(1);
      expect(t.wormhole_pairs.length).toBeLessThanOrEqual(4);
    }
  });

  it('each wormhole pair has two distinct 3D points', () => {
    const t = deriveTopology(makePrng());
    for (const [pa, pb] of t.wormhole_pairs) {
      expect(pa.length).toBe(3);
      expect(pb.length).toBe(3);
      expect(pa).not.toEqual(pb);
    }
  });

  it('is deterministic for the same prng state', () => {
    const t1 = deriveTopology(makePrng(42));
    const t2 = deriveTopology(makePrng(42));
    expect(t1).toEqual(t2);
  });
});
