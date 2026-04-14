import { Xoshiro256 } from '../manifold/prng';
import type { Seed } from '../manifold/types';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorScheme {
  primary: RGBColor;
  secondary: RGBColor;
  accent: RGBColor;
  background: RGBColor;
}

function hslToRgb(h: number, s: number, l: number): RGBColor {
  // Normalize hue to [0, 360)
  h = h % 360;
  if (h < 0) h += 360;

  // HSL to RGB conversion
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (hPrime < 1) {
    r = c;
    g = x;
  } else if (hPrime < 2) {
    r = x;
    g = c;
  } else if (hPrime < 3) {
    g = c;
    b = x;
  } else if (hPrime < 4) {
    g = x;
    b = c;
  } else if (hPrime < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function generateColorScheme(seed: Seed): ColorScheme {
  const prng = new Xoshiro256(new Uint8Array(seed));

  // Pick base hue from seed (0-360)
  const baseHue = prng.nextFloat() * 360;

  // Generate split-complementary palette: base hue, and two colors at ±150°
  return {
    background: hslToRgb(baseHue, 0.18, 0.07),           // dark, desaturated
    primary: hslToRgb(baseHue, 0.75, 0.55),              // vibrant main color
    secondary: hslToRgb(baseHue + 150, 0.65, 0.50),     // split-complementary 1
    accent: hslToRgb(baseHue + 210, 0.78, 0.60),        // split-complementary 2
  };
}
