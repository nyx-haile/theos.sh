import type { Xoshiro256 } from './prng';
import type { GeodesicCoords, Topology } from './types';

const WORLD_RADIUS = 50;

export function deriveTopology(prng: Xoshiro256): Topology {
  const genus = Math.floor(prng.nextFloat() * 4); // 0–3

  const wormhole_count = Math.floor(prng.nextFloat() * 4) + 1; // 1–4
  const wormhole_pairs: Array<[GeodesicCoords, GeodesicCoords]> = [];

  for (let i = 0; i < wormhole_count; i++) {
    const pa: GeodesicCoords = [
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
    ];
    const pb: GeodesicCoords = [
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
    ];
    wormhole_pairs.push([pa, pb]);
  }

  return { genus, wormhole_pairs };
}
