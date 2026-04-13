import { describe, it, expect } from 'vitest';
import { MutationsStore } from '../../src/viewport/mutations-store';
import type { ForceOp, QuantizedCoords } from '../../src/manifold/types';

const OP: ForceOp = { type: 'ForceOp', field_delta: { direction: [1, 0, 0], magnitude: 1 } };
const COORDS: QuantizedCoords = '0,0,0';

describe('MutationsStore', () => {
  it('returns empty array for unseen coords', () => {
    const store = new MutationsStore();
    expect(store.get(COORDS)).toEqual([]);
  });

  it('stores and retrieves mutations', () => {
    const store = new MutationsStore();
    store.add(COORDS, OP);
    expect(store.get(COORDS).length).toBe(1);
  });

  it('accumulates multiple mutations at the same coords', () => {
    const store = new MutationsStore();
    store.add(COORDS, OP);
    store.add(COORDS, OP);
    expect(store.get(COORDS).length).toBe(2);
  });

  it('evicts oldest entry when cap is exceeded', () => {
    const store = new MutationsStore(2);
    store.add('0,0,0', OP);
    store.add('1,0,0', OP);
    store.add('2,0,0', OP); // should evict '0,0,0'
    expect(store.get('0,0,0')).toEqual([]);
    expect(store.get('1,0,0').length).toBe(1);
    expect(store.get('2,0,0').length).toBe(1);
    expect(store.size).toBe(2);
  });

  it('does not evict below cap', () => {
    const store = new MutationsStore(512);
    for (let i = 0; i < 100; i++) {
      store.add(`${i},0,0` as QuantizedCoords, OP);
    }
    expect(store.size).toBe(100);
  });
});
