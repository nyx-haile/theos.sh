export type Tier = 1 | 2 | 3;

export function detectTier(): Tier {
  if (typeof globalThis === 'undefined') return 3;

  // Check WebGPU
  if ((globalThis.navigator as any)?.gpu) {
    return 1;
  }

  // Check WebGL2
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2');
    if (ctx) return 2;
  }

  return 3;
}
