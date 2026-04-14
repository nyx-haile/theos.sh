import { detectTier } from '../rendering/tier';
import { generateRawSeed, deriveSeed } from '../manifold/seed';
import type { Seed, Tier, CapabilityMask } from '../manifold/types';

export class SystemProbe {
  run(): CapabilityMask {
    const tier = detectTier();
    const device_pixel_ratio = typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis
      ? (globalThis as any).devicePixelRatio
      : 1;

    return { tier, device_pixel_ratio };
  }
}

export function runOriginPhase(): { seed: Seed; tier: Tier; mask: CapabilityMask } {
  const probe = new SystemProbe();
  const mask = probe.run();
  const rawSeed = generateRawSeed();
  const seed = deriveSeed(rawSeed, mask);

  return { seed, tier: mask.tier, mask };
}
