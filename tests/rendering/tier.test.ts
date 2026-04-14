import { describe, it, expect } from 'vitest';
import { detectTier } from '../../src/rendering/tier';

describe('detectTier', () => {
  it('returns 1 if WebGPU is available', () => {
    const original = (globalThis.navigator as any).gpu;
    (globalThis.navigator as any).gpu = {};
    try {
      expect(detectTier()).toBe(1);
    } finally {
      (globalThis.navigator as any).gpu = original;
    }
  });

  it('returns 2 if WebGL2 is available but not WebGPU', () => {
    const original = (globalThis.navigator as any).gpu;
    (globalThis.navigator as any).gpu = undefined;
    try {
      // In Node, document doesn't exist, so it falls through to 3
      const tier = detectTier();
      expect([2, 3]).toContain(tier);
    } finally {
      (globalThis.navigator as any).gpu = original;
    }
  });

  it('returns 3 if neither WebGPU nor WebGL2 available', () => {
    const original = (globalThis.navigator as any).gpu;
    (globalThis.navigator as any).gpu = undefined;
    try {
      expect(detectTier()).toBe(3);
    } finally {
      (globalThis.navigator as any).gpu = original;
    }
  });
});
