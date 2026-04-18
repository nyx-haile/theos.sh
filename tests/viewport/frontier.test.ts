import { describe, it, expect } from 'vitest';
import { Frontier } from '../../src/viewport/frontier';
import type { Topology } from '../../src/manifold/types';

describe('Frontier', () => {
  it('starts with zero pending', () => {
    expect(new Frontier().pendingCount).toBe(0);
  });

  it('seed adds origin neighbors to pending', () => {
    const f = new Frontier();
    f.seed([0, 0, 0]);
    // 26 neighbors in 3D + origin cell itself
    expect(f.pendingCount).toBeGreaterThan(0);
  });

  it('markResolved removes from pending', () => {
    const f = new Frontier();
    f.seed([0, 0, 0]);
    const before = f.pendingCount;
    f.markResolved([0, 0, 0]);
    expect(f.pendingCount).toBeLessThan(before);
  });

  it('resolved coords are not re-added on expand', () => {
    const f = new Frontier();
    f.seed([0, 0, 0]);
    f.markResolved([0, 0, 0]);
    f.expand([0, 0, 0]);
    // [0,0,0] should not be pending again
    const coords = f.pendingCoords;
    expect(coords).not.toContainEqual([0, 0, 0]);
  });

  it('registerWormholes adds endpoints to pending', () => {
    const f = new Frontier();
    const topology: Topology = {
      genus: 0,
      wormhole_pairs: [[[10, 10, 10], [20, 20, 20]]],
    };
    f.registerWormholes(topology);
    expect(f.pendingCount).toBe(2);
  });
});
