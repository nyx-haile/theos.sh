import type { Seed, CapabilityMask } from './types';

export function generateRawSeed(): Seed {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function deriveSeed(rawSeed: Seed, mask: CapabilityMask): Seed {
  const derived = new Uint8Array(rawSeed); // copy — do not mutate
  const b0 = derived[0] ?? 0;
  const b1 = derived[1] ?? 0;
  derived[0] = b0 ^ mask.tier;
  derived[1] = b1 ^ (Math.round(mask.device_pixel_ratio * 32) & 0xff);
  return derived;
}
