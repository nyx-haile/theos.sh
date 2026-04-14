import { describe, it, expect } from 'vitest';
import { rgbToHsv, hsvToRgbString } from './hsv-to-rgb';

describe('rgbToHsv', () => {
  it('pure red', () => {
    const [h, s, v] = rgbToHsv(1, 0, 0);
    expect(h).toBe(0); expect(s).toBe(1); expect(v).toBe(1);
  });
  it('black', () => {
    const [, s, v] = rgbToHsv(0, 0, 0);
    expect(v).toBe(0); expect(s).toBe(0);
  });
  it('clamps extremes', () => {
    const [, , v] = rgbToHsv(2, 2, 2);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('hsvToRgbString', () => {
  it('returns rgb() formatted string', () => {
    expect(hsvToRgbString(0, 1, 1)).toBe('rgb(255,0,0)');
  });
  it('clamps saturation and value to [0,1]', () => {
    expect(hsvToRgbString(0, 5, 5)).toBe('rgb(255,0,0)');
  });
});
