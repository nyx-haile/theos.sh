import { describe, it, expect } from 'vitest';
import { sha256, sha256Hex, sha256First32, deriveFloat } from './hash';

describe('sha256', () => {
  it('matches NIST vector for empty input', () => {
    const got = sha256Hex(new Uint8Array());
    expect(got).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches NIST vector for "abc"', () => {
    const got = sha256Hex(new TextEncoder().encode('abc'));
    expect(got).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns 32 bytes', () => {
    expect(sha256(new TextEncoder().encode('hi')).length).toBe(32);
  });
});

describe('sha256Hex', () => {
  it('returns 64 lowercase hex chars', () => {
    const hex = sha256Hex(new TextEncoder().encode('x'));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sha256First32', () => {
  it('returns a u32 in [0, 2^32)', () => {
    const v = sha256First32(new TextEncoder().encode('x'));
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(2 ** 32);
  });
  it('is deterministic', () => {
    const bytes = new TextEncoder().encode('same');
    expect(sha256First32(bytes)).toBe(sha256First32(bytes));
  });
});

describe('deriveFloat', () => {
  const seed = new Uint8Array(32).fill(7);

  it('is deterministic', () => {
    expect(deriveFloat(seed, 'a')).toBe(deriveFloat(seed, 'a'));
  });

  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = deriveFloat(seed, `label-${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('uses a separator so label splits do not collide', () => {
    expect(deriveFloat(seed, 'ab', 'c')).not.toBe(deriveFloat(seed, 'a', 'bc'));
  });

  it('different seeds yield different outputs', () => {
    const s2 = new Uint8Array(32).fill(8);
    expect(deriveFloat(seed, 'x')).not.toBe(deriveFloat(s2, 'x'));
  });
});
