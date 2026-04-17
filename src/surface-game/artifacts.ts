import type { Artifact } from './types';
import type { TunablesShape } from '../config/tunables';
import { Xoshiro256 } from '../manifold/prng';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** P1 placement: uniform random (u, v) with bounded radius/offset/spikes, seed-deterministic. */
export function placeArtifacts(seed: Uint8Array, t: TunablesShape): Artifact[] {
  // Tag the sub-seed so artifact placement doesn't alias the surface-noise stream.
  const sub = new Uint8Array(seed);
  sub[2] = (sub[2] ?? 0) ^ 0xA7;
  const prng = new Xoshiro256(sub);

  const [minN, maxN] = t.artifacts.countRange;
  const span = Math.max(0, maxN - minN);
  const n = minN + Math.floor(prng.nextFloat() * (span + 1));

  const rScale = t.manifold.minorRadius;
  const [minR, maxR] = t.artifacts.radiusRange;
  const [minO, maxO] = t.artifacts.offsetRange;
  const [minS, maxS] = t.artifacts.spikesRange;

  const out: Artifact[] = [];
  for (let i = 0; i < n; i++) {
    const u = prng.nextFloat();
    const v = prng.nextFloat();
    const radius = lerp(minR, maxR, prng.nextFloat()) * rScale;
    const offset = lerp(minO, maxO, prng.nextFloat()) * rScale;
    const spikes = minS + Math.floor(prng.nextFloat() * (maxS - minS + 1));
    out.push({ id: i, u, v, radius, offset, spikes });
  }
  return out;
}
