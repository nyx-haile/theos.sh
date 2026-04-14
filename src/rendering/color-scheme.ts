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

export function generateColorScheme(seed: Seed): ColorScheme {
  const prng = new Xoshiro256(new Uint8Array(seed));

  return {
    primary: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
    secondary: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
    accent: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
    background: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
  };
}
