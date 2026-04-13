import { describe, it, expect } from 'vitest';
import { Xoshiro256 } from '../../src/manifold/prng';

describe('Xoshiro256', () => {
  it('produces deterministic output from the same seed', () => {
    const seed = new Uint8Array(32).fill(42);
    const a = new Xoshiro256(new Uint8Array(seed));
    const b = new Xoshiro256(new Uint8Array(seed));
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  it('produces different output from different seeds', () => {
    const a = new Xoshiro256(new Uint8Array(32).fill(1));
    const b = new Xoshiro256(new Uint8Array(32).fill(2));
    expect(a.next()).not.toBe(b.next());
  });

  it('nextFloat returns values in [0, 1)', () => {
    const prng = new Xoshiro256(new Uint8Array(32).fill(7));
    for (let i = 0; i < 1000; i++) {
      const f = prng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('throws on seed shorter than 32 bytes', () => {
    expect(() => new Xoshiro256(new Uint8Array(16))).toThrow('Seed must be at least 32 bytes');
  });
});
