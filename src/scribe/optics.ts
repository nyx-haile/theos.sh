import type { OpticalParameters } from './types';

/**
 * Optical behavior is selected from the actual rendered size, not a CSS media
 * query. The values deliberately change topology/detail as well as line width.
 */
export function opticalParameters(pxPerEm: number): OpticalParameters {
  if (!Number.isFinite(pxPerEm) || pxPerEm <= 0) {
    throw new RangeError('pxPerEm must be a finite positive number');
  }

  const normalized = Math.max(0, Math.min(1, (pxPerEm - 18) / (180 - 18)));
  const eased = normalized * normalized * (3 - 2 * normalized);
  const textureNormalized = Math.max(0, Math.min(1, (pxPerEm - 24) / (180 - 24)));
  const textureEased = textureNormalized * textureNormalized * (3 - 2 * textureNormalized);
  const lerp = (micro: number, display: number): number => micro + (display - micro) * eased;
  return {
    profile: pxPerEm < 30 ? 'micro' : pxPerEm < 84 ? 'text' : 'display',
    loopDetail: lerp(0.58, 1),
    counterOpen: lerp(0.19, 0.045),
    pressureRange: lerp(0.18, 0.48),
    texture: 0.003 * textureEased,
    strokeScale: lerp(0.052, 0.036),
  };
}
