import { describe, it, expect } from 'vitest';
import { createManifoldFn, quantizeCoords } from '../../src/manifold/manifold-fn';
import type { GeodesicCoords } from '../../src/manifold/types';

const SEED = new Uint8Array(32).fill(99);
const REGISTRY_LENGTH = 10;

describe('quantizeCoords', () => {
  it('snaps coordinates to cell grid', () => {
    const result = quantizeCoords([0.4, 0.6, -0.4]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
    expect(Math.abs(result[2])).toBe(0); // handles -0 vs 0
  });

  it('origin stays at origin', () => {
    expect(quantizeCoords([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('createManifoldFn', () => {
  it('returns a function', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    expect(typeof fn).toBe('function');
  });

  it('descriptor has all required fields', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const d = fn([0, 0, 0], [], 1);
    expect(d.curvature_tensor.length).toBe(3);
    expect(d.christoffel_symbols).not.toBeNull();
    expect(d.topology).toBeDefined();
    expect(typeof d.content_module_id).toBe('number');
    expect(d.color_params).toBeDefined();
    expect(d.force_field).toBeDefined();
  });

  it('christoffel_symbols is null in Tier 3', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const d = fn([0, 0, 0], [], 3);
    expect(d.christoffel_symbols).toBeNull();
  });

  it('is deterministic: same coords + mutations → same descriptor', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const a = fn([1, 2, 3], [], 1);
    const b = fn([1, 2, 3], [], 1);
    expect(a).toEqual(b);
  });

  it('content_module_id is within registry bounds', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    for (const coords of [[0,0,0],[1,0,0],[0,1,0],[5,5,5]] as GeodesicCoords[]) {
      const d = fn(coords, [], 1);
      expect(d.content_module_id).toBeGreaterThanOrEqual(0);
      expect(d.content_module_id).toBeLessThan(REGISTRY_LENGTH);
    }
  });

  it('mutations alter the force_field', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const base = fn([0, 0, 0], [], 1);
    const mutated = fn([0, 0, 0], [{
      op: { type: 'ForceOp', field_delta: { direction: [1, 0, 0], magnitude: 5 } },
      coords: '0,0,0',
      timestamp: 0,
    }], 1);
    expect(mutated.force_field.magnitude).not.toBe(base.force_field.magnitude);
  });

  it('exposes topology as a property', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    expect(fn.topology).toBeDefined();
    expect(fn.topology.wormhole_pairs.length).toBeGreaterThan(0);
  });
});
