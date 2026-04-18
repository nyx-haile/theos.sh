import { describe, it, expect } from 'vitest';
import { effectPrng } from './prng';

describe('effectPrng', () => {
  const seed = new Uint8Array(32).fill(1);

  it('is deterministic for the same name', () => {
    const a = effectPrng(seed, 'jitter'); const b = effectPrng(seed, 'jitter');
    for (let i = 0; i < 16; i++) expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('differs across effect names', () => {
    const a = effectPrng(seed, 'jitter'); const b = effectPrng(seed, 'shadow');
    const diffs: boolean[] = [];
    for (let i = 0; i < 16; i++) diffs.push(a.nextFloat() !== b.nextFloat());
    expect(diffs.filter(Boolean).length).toBeGreaterThan(10);
  });

  it('differs across seeds', () => {
    const s2 = new Uint8Array(32).fill(2);
    const a = effectPrng(seed, 'x'); const b = effectPrng(s2, 'x');
    const diffs: boolean[] = [];
    for (let i = 0; i < 16; i++) diffs.push(a.nextFloat() !== b.nextFloat());
    expect(diffs.filter(Boolean).length).toBeGreaterThan(10);
  });
});
