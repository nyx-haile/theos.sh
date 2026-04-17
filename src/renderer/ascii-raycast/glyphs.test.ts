import { describe, it, expect } from 'vitest';
import { luminanceGlyph, artifactGlyph } from './glyphs';
import { defaultTunables } from '../../config/tunables';

describe('glyph selection', () => {
  const t = defaultTunables();

  it('luminance 0 picks the darkest glyph', () => {
    expect(luminanceGlyph(0, t.glyphs.luminanceRamp)).toBe(t.glyphs.luminanceRamp[0]);
  });

  it('luminance 1 picks the brightest glyph', () => {
    const last = t.glyphs.luminanceRamp[t.glyphs.luminanceRamp.length - 1];
    expect(luminanceGlyph(1, t.glyphs.luminanceRamp)).toBe(last);
  });

  it('luminance values are clamped to [0, 1]', () => {
    expect(luminanceGlyph(-1, t.glyphs.luminanceRamp)).toBe(t.glyphs.luminanceRamp[0]);
    expect(luminanceGlyph(2, t.glyphs.luminanceRamp)).toBe(t.glyphs.luminanceRamp[t.glyphs.luminanceRamp.length - 1]);
  });

  it('artifact glyph: near distances pick from near-set, far distances use far glyph', () => {
    const near = artifactGlyph(0.05, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, 1.0);
    const far = artifactGlyph(5.0, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, 1.0);
    expect(t.glyphs.artifactGlyphsNear.includes(near)).toBe(true);
    expect(far).toBe(t.glyphs.artifactGlyphFar);
  });
});
