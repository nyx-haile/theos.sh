import { describe, it, expect } from 'vitest';
import { generateColorScheme } from './scheme';

describe('generateColorScheme', () => {
  it('returns RGB values in valid ranges', () => {
    const seed = new Uint8Array(32).fill(5);
    const scheme = generateColorScheme(seed);

    for (const color of [scheme.primary, scheme.secondary, scheme.accent]) {
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(255);
      expect(color.g).toBeGreaterThanOrEqual(0);
      expect(color.g).toBeLessThanOrEqual(255);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(255);
    }
  });

  it('is deterministic for same seed', () => {
    const seed = new Uint8Array(32).fill(7);
    const a = generateColorScheme(seed);
    const b = generateColorScheme(new Uint8Array(seed));
    expect(a).toEqual(b);
  });

  it('produces different schemes for different seeds', () => {
    const a = generateColorScheme(new Uint8Array(32).fill(1));
    const b = generateColorScheme(new Uint8Array(32).fill(2));
    expect(a).not.toEqual(b);
  });
});
