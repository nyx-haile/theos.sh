import { describe, it, expect } from 'vitest';
import { InputMapper } from '../../src/input/input-mapper';

const SEED_A = new Uint8Array(32).fill(11);
const SEED_B = new Uint8Array(32).fill(22);

describe('InputMapper', () => {
  it('movement keys always resolve to ViewportOp', () => {
    const mapper = new InputMapper(SEED_A);
    for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const op = mapper.resolve({ type: 'keydown', key });
      expect(op?.type).toBe('ViewportOp');
    }
  });

  it('number keys always resolve to ObjectOp', () => {
    const mapper = new InputMapper(SEED_A);
    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const op = mapper.resolve({ type: 'keydown', key });
      expect(op?.type).toBe('ObjectOp');
    }
  });

  it('mouse events resolve to an op', () => {
    const mapper = new InputMapper(SEED_A);
    for (const type of ['click', 'scroll', 'drag'] as const) {
      const op = mapper.resolve({ type });
      expect(op).not.toBeNull();
    }
  });

  it('unknown key returns null', () => {
    const mapper = new InputMapper(SEED_A);
    expect(mapper.resolve({ type: 'keydown', key: 'F12' })).toBeNull();
  });

  it('is deterministic: same seed → same mapping', () => {
    const a = new InputMapper(SEED_A);
    const b = new InputMapper(new Uint8Array(SEED_A));
    expect(a.resolve({ type: 'keydown', key: 'w' })).toEqual(b.resolve({ type: 'keydown', key: 'w' }));
  });

  it('different seeds may produce different mouse bindings', () => {
    const a = new InputMapper(SEED_A);
    const b = new InputMapper(SEED_B);
    // Run many seeds until we find a difference (probabilistic — at least 1 in 27 seeds will differ)
    const opsA = ['click', 'scroll', 'drag'].map(t => a.resolve({ type: t as any })?.type);
    const opsB = ['click', 'scroll', 'drag'].map(t => b.resolve({ type: t as any })?.type);
    // The two seeds should not always produce identical mappings across all three events
    // (statistically near-certain with different fills)
    expect(opsA.join()).not.toBe(opsB.join());
  });
});
