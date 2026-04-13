import { describe, it, expect } from 'vitest';
import { generateRawSeed, deriveSeed } from '../../src/manifold/seed';
import type { CapabilityMask } from '../../src/manifold/types';

describe('generateRawSeed', () => {
  it('returns 32 bytes', () => {
    expect(generateRawSeed().length).toBe(32);
  });

  it('produces different values on each call', () => {
    const a = generateRawSeed();
    const b = generateRawSeed();
    expect(a).not.toEqual(b);
  });
});

describe('deriveSeed', () => {
  it('is deterministic for the same inputs', () => {
    const raw = new Uint8Array(32).fill(7);
    const mask: CapabilityMask = { tier: 1, device_pixel_ratio: 2 };
    expect(deriveSeed(raw, mask)).toEqual(deriveSeed(raw, mask));
  });

  it('produces different seeds for different tiers', () => {
    const raw = new Uint8Array(32).fill(7);
    const m1: CapabilityMask = { tier: 1, device_pixel_ratio: 1 };
    const m2: CapabilityMask = { tier: 2, device_pixel_ratio: 1 };
    expect(deriveSeed(raw, m1)).not.toEqual(deriveSeed(raw, m2));
  });

  it('does not mutate the original raw seed', () => {
    const raw = new Uint8Array(32).fill(5);
    const copy = new Uint8Array(raw);
    deriveSeed(raw, { tier: 1, device_pixel_ratio: 1 });
    expect(raw).toEqual(copy);
  });
});
