import { createNoise4D } from 'simplex-noise';
import type { Xoshiro256 } from '../manifold/prng';

export interface NoiseOptions {
  octaves: number;
  lacunarity: number; // e.g. 2.0
  gain: number;       // e.g. 0.5
}

export interface PeriodicNoise {
  /** h(u, v) where (u, v) ∈ [0, 1]²; exactly periodic at both edges. Output in [-1, 1]. */
  sample(u: number, v: number): number;
}

export function createPeriodicNoise(prng: Xoshiro256, opts: NoiseOptions): PeriodicNoise {
  const noise4D = createNoise4D(() => prng.nextFloat());
  const { octaves, lacunarity, gain } = opts;
  const TAU = Math.PI * 2;

  return {
    sample(u: number, v: number): number {
      // Project (u, v) ∈ [0,1)² onto the 2-torus embedded in ℝ⁴.
      // Guarantees exact periodicity because (cos, sin) is 1-periodic in (u, v).
      let value = 0;
      let amp = 1;
      let freq = 1;
      let max = 0;

      for (let i = 0; i < octaves; i++) {
        const a = TAU * freq * u;
        const b = TAU * freq * v;
        value += noise4D(Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)) * amp;
        max += amp;
        amp *= gain;
        freq *= lacunarity;
      }

      return value / max;
    },
  };
}
