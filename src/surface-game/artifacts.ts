import type { Artifact } from './types';
import type { TunablesShape } from '../config/tunables';
import type { ManifoldBackend } from '../surface/types';
import { Xoshiro256 } from '../manifold/prng';
import { findExtremaCandidates, pickWithMinSeparation, type FeaturePoint } from './feature-points';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** P3 placement: bias (u, v) toward local extrema of the height field so
 *  artifacts crown hilltops and valley floors rather than scattering uniformly.
 *  Falls back to uniform random draws when the feature finder cannot supply
 *  enough separated candidates. Backend is optional to keep the P1-style
 *  call sites compiling; when omitted, behavior is uniform random. */
export function placeArtifacts(
  seed: Uint8Array,
  t: TunablesShape,
  backend?: ManifoldBackend,
): Artifact[] {
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

  const featureUVs: FeaturePoint[] = backend
    ? pickWithMinSeparation(
        findExtremaCandidates((u, v) => backend.heightAt(u, v), t.artifacts.featureGridN),
        n,
        t.artifacts.minSeparation,
      )
    : [];

  const out: Artifact[] = [];
  for (let i = 0; i < n; i++) {
    const feat = featureUVs[i];
    const u = feat ? feat.u : prng.nextFloat();
    const v = feat ? feat.v : prng.nextFloat();
    const radius = lerp(minR, maxR, prng.nextFloat()) * rScale;
    const offset = lerp(minO, maxO, prng.nextFloat()) * rScale;
    const spikes = minS + Math.floor(prng.nextFloat() * (maxS - minS + 1));
    out.push({ id: i, u, v, radius, offset, spikes });
  }
  return out;
}
