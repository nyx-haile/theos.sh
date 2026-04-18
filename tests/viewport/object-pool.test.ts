import { describe, it, expect } from 'vitest';
import { ObjectPool } from '../../src/viewport/object-pool';
import type { GeodesicCoords, Descriptor, Topology } from '../../src/manifold/types';

const TOPOLOGY: Topology = { genus: 0, wormhole_pairs: [] };

function makeDescriptor(): Descriptor {
  return {
    curvature_tensor: [[1,0,0],[0,1,0],[0,0,1]],
    christoffel_symbols: null,
    topology: TOPOLOGY,
    content_module_id: 0,
    color_params: { hue_offset: 0, saturation_scale: 1 },
    force_field: { direction: [0,0,1], magnitude: 0 },
  };
}

describe('ObjectPool', () => {
  it('starts empty', () => {
    expect(new ObjectPool(10).size).toBe(0);
  });

  it('adds entries up to capacity', () => {
    const pool = new ObjectPool(3);
    pool.add([0,0,0], makeDescriptor());
    pool.add([1,0,0], makeDescriptor());
    pool.add([2,0,0], makeDescriptor());
    expect(pool.size).toBe(3);
  });

  it('evicts furthest entry when at capacity', () => {
    const pool = new ObjectPool(2);
    pool.add([0, 0, 0], makeDescriptor());   // near origin
    pool.add([100, 0, 0], makeDescriptor()); // far
    // Add from [0,0,0] — should evict [100,0,0]
    pool.add([1, 0, 0], makeDescriptor());
    expect(pool.size).toBe(2);
    const coords = pool.all.map(e => e.coords);
    expect(coords).not.toContainEqual([100, 0, 0]);
  });

  it('getVisible returns entries within radius', () => {
    const pool = new ObjectPool(10);
    pool.add([0, 0, 0], makeDescriptor());
    pool.add([1, 0, 0], makeDescriptor());
    pool.add([50, 0, 0], makeDescriptor());
    const visible = pool.getVisible([0, 0, 0], 5);
    expect(visible.length).toBe(2);
  });
});
