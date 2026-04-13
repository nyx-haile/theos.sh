import type { Seed, CapabilityMask } from './types';

export function generateRawSeed(): Seed {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function deriveSeed(rawSeed: Seed, mask: CapabilityMask): Seed {
  const derived = new Uint8Array(rawSeed); // copy — do not mutate
  derived[0] ^= mask.tier;
  derived[1] ^= Math.round(mask.device_pixel_ratio * 32) & 0xff;
  return derived;
}
