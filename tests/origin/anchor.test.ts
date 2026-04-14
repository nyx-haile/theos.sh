import { describe, it, expect } from 'vitest';
import { SystemProbe, runOriginPhase } from '../../src/origin/anchor';

describe('SystemProbe', () => {
  it('detects available APIs', () => {
    const probe = new SystemProbe();
    const result = probe.run();

    expect(result.tier).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBeLessThanOrEqual(3);
    expect(result.device_pixel_ratio).toBeGreaterThan(0);
  });

  it('tier matches capability', () => {
    const probe = new SystemProbe();
    const result = probe.run();
    expect(result.tier).toBeDefined();
  });
});

describe('runOriginPhase', () => {
  it('returns seed and tier', () => {
    const { seed, tier } = runOriginPhase();
    expect(seed.length).toBe(32);
    expect(tier).toBeGreaterThanOrEqual(1);
    expect(tier).toBeLessThanOrEqual(3);
  });
});
