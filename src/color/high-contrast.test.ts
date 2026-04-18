import { describe, it, expect } from 'vitest';
import { HIGH_CONTRAST_SCHEME } from './high-contrast';

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const [L1, L2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (L1! + 0.05) / (L2! + 0.05);
}

describe('HIGH_CONTRAST_SCHEME', () => {
  it('has true black background', () => {
    expect(HIGH_CONTRAST_SCHEME.background).toEqual({ r: 0, g: 0, b: 0 });
  });
  it('primary vs background passes WCAG AA for normal text (>= 4.5)', () => {
    expect(contrast(HIGH_CONTRAST_SCHEME.primary, HIGH_CONTRAST_SCHEME.background)).toBeGreaterThanOrEqual(4.5);
  });
  it('secondary vs background passes AA', () => {
    expect(contrast(HIGH_CONTRAST_SCHEME.secondary, HIGH_CONTRAST_SCHEME.background)).toBeGreaterThanOrEqual(4.5);
  });
  it('accent vs background passes AA', () => {
    expect(contrast(HIGH_CONTRAST_SCHEME.accent, HIGH_CONTRAST_SCHEME.background)).toBeGreaterThanOrEqual(4.5);
  });
});
