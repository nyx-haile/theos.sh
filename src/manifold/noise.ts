import { createNoise3D } from 'simplex-noise';
import type { Xoshiro256 } from './prng';

export interface NoiseField {
  sample(x: number, y: number, z: number, octaves?: number): number;
}

export function createNoiseField(prng: Xoshiro256): NoiseField {
  const noise3D = createNoise3D(() => prng.nextFloat());

  return {
    sample(x: number, y: number, z: number, octaves = 4): number {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let max = 0;

      for (let i = 0; i < octaves; i++) {
        value += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
        max += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      return value / max; // normalized to [-1, 1]
    },
  };
}
