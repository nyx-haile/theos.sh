import { describe, it, expect } from 'vitest';
import { gate, gateParam } from './gates';

const seed = new Uint8Array(32).fill(42);

describe('gate', () => {
  it('is deterministic', () => {
    expect(gate(seed, 'shadow3D')).toBe(gate(seed, 'shadow3D'));
  });

  it('returns values in [0,1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = gate(seed, `eff-${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('mean is approximately 0.5 over 10k samples', () => {
    let sum = 0;
    for (let i = 0; i < 10_000; i++) sum += gate(seed, `mean-${i}`);
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });

  it('changes on a single-bit seed flip', () => {
    const s2 = new Uint8Array(seed); s2[0] = (s2[0]! ^ 0x01);
    expect(gate(s2, 'x')).not.toBe(gate(seed, 'x'));
  });
});

describe('gateParam', () => {
  it('differs from gate for same name', () => {
    expect(gateParam(seed, 'shadow3D', 'angle')).not.toBe(gate(seed, 'shadow3D'));
  });

  it('separator prevents label-concat collisions', () => {
    expect(gateParam(seed, 'ab', 'c')).not.toBe(gateParam(seed, 'a', 'bc'));
  });
});
