/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { bootAndTick } from './helpers/record';
import { SEEDS } from '../fixtures/seeds';

describe('determinism', () => {
  for (const s of SEEDS) {
    it(`${s.id}: two runs produce byte-identical frame streams`, () => {
      const ticks = [0, 500, 1500, 3000, 6000, 10_000];
      const a = bootAndTick(s.bytes, 10, 20, ticks);
      const b = bootAndTick(s.bytes, 10, 20, ticks);
      expect(a).toEqual(b);
    });
  }

  it('different seeds produce differing streams', () => {
    const ticks = [0, 1000];
    const a = bootAndTick(SEEDS[0]!.bytes, 10, 20, ticks);
    const b = bootAndTick(SEEDS[1]!.bytes, 10, 20, ticks);
    expect(a.some((r, i) => r.hash !== b[i]!.hash)).toBe(true);
  });
});
