function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** luminance ∈ [0,1] → glyph from ramp. Values outside the range are clamped. */
export function luminanceGlyph(luminance: number, ramp: string): string {
  const L = ramp.length;
  if (L === 0) return ' ';
  const i = Math.min(L - 1, Math.floor(clamp(luminance, 0, 1) * L));
  return ramp[i]!;
}

/** Artifact glyph: near artifacts use near-set (seeded per-artifact via spikes or id),
 * far artifacts collapse to a single far glyph. Threshold is a fraction of scene scale. */
export function artifactGlyph(distance: number, nearSet: string, farGlyph: string, sceneScale: number): string {
  const threshold = 0.25 * sceneScale;
  if (distance > threshold) return farGlyph;
  const idx = Math.min(nearSet.length - 1, Math.floor((distance / threshold) * nearSet.length));
  return nearSet[idx]!;
}
