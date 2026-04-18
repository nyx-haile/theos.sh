import { describe, it, expect } from 'vitest';
import { ViewportManager } from '../../src/viewport/viewport-manager';
import { createManifoldFn } from '../../src/manifold/manifold-fn';
import { ContentRegistry } from '../../src/content/registry';
import type { ContentModule } from '../../src/content/types';

const SEED = new Uint8Array(32).fill(55);

function makeModule(): ContentModule {
  return {
    id: 'test',
    type: 'work',
    render_hints: {
      tier1: { splat_scale: 1, sdf_morph: false },
      tier2: { warp_intensity: 0.5, sdf_morph: false },
      tier3: { ascii_density: 0.5, border_char: '#' },
    },
    content: 'hello',
    interactions: [],
  };
}

function makeVM(tier: 1 | 2 | 3 = 1) {
  const registry = new ContentRegistry([makeModule()]);
  const fn = createManifoldFn(SEED, registry.length);
  return new ViewportManager(fn, registry, tier);
}

describe('ViewportManager', () => {
  it('initializes at origin', () => {
    const vm = makeVM();
    expect(vm.position).toEqual([0, 0, 0]);
  });

  it('resolves origin cell on construction', () => {
    const vm = makeVM();
    expect(vm.loadedCount).toBeGreaterThan(0);
  });

  it('dispatch ViewportOp translate moves position', () => {
    const vm = makeVM();
    vm.dispatch({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    expect(vm.position).not.toEqual([0, 0, 0]);
  });

  it('dispatch ForceOp records a mutation', () => {
    const vm = makeVM();
    vm.dispatch({ type: 'ForceOp', field_delta: { direction: [1, 0, 0], magnitude: 1 } });
    expect(vm.mutationsCount).toBe(1);
  });

  it('loaded chunk count stays bounded after many moves', () => {
    const vm = makeVM();
    for (let i = 0; i < 50; i++) {
      vm.dispatch({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    }
    expect(vm.loadedCount).toBeLessThan(200);
  });

  it('pool size stays within capacity', () => {
    const vm = makeVM();
    for (let i = 0; i < 30; i++) {
      vm.dispatch({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    }
    expect(vm.poolSize).toBeLessThanOrEqual(256);
  });
});
