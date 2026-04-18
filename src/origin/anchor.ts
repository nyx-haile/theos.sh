import { detectRenderer } from '../renderers/detect';
import { generateRawSeed, deriveSeed } from '../manifold/seed';
import type { Seed, Tier, CapabilityMask } from '../manifold/types';

function rendererToTier(): Tier {
  const kind = detectRenderer();
  if (kind === 'webgpu') return 1;
  if (kind === 'webgl2') return 2;
  return 3;
}

export class SystemProbe {
  run(): CapabilityMask {
    const tier = rendererToTier();
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
