import { describe, expect, it } from 'vitest';
import { opticalParameters } from './optics';

describe('Scribe optical sizing', () => {
  it('selects micro, text, and display profiles at the authored thresholds', () => {
    expect(opticalParameters(29.999).profile).toBe('micro');
    expect(opticalParameters(30).profile).toBe('text');
    expect(opticalParameters(83.999).profile).toBe('text');
    expect(opticalParameters(84).profile).toBe('display');
  });

  it('opens and strengthens small writing while preserving display detail', () => {
    const micro = opticalParameters(18);
    const display = opticalParameters(160);
    expect(micro.counterOpen).toBeGreaterThan(display.counterOpen);
    expect(micro.strokeScale).toBeGreaterThan(display.strokeScale);
    expect(micro.loopDetail).toBeLessThan(display.loopDetail);
    expect(micro.pressureRange).toBeLessThan(display.pressureRange);
    expect(micro.texture).toBe(0);
  });

  it('changes optical geometry continuously rather than jumping at profile labels', () => {
    const beforeText = opticalParameters(29.999);
    const text = opticalParameters(30);
    const beforeDisplay = opticalParameters(83.999);
    const display = opticalParameters(84);
    expect(Math.abs(text.loopDetail - beforeText.loopDetail)).toBeLessThan(0.001);
    expect(Math.abs(display.strokeScale - beforeDisplay.strokeScale)).toBeLessThan(0.001);
    expect(opticalParameters(60).loopDetail).toBeGreaterThan(opticalParameters(40).loopDetail);
    expect(opticalParameters(120).counterOpen).toBeLessThan(opticalParameters(80).counterOpen);
  });

  it('rejects non-physical rendered sizes', () => {
    expect(() => opticalParameters(0)).toThrow(/pxPerEm/);
    expect(() => opticalParameters(Number.POSITIVE_INFINITY)).toThrow(/pxPerEm/);
  });
});
