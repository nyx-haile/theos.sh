import { describe, it, expect } from 'vitest';
import { createTunables } from './tunables';

describe('tunables store', () => {
  it('has sane defaults for every group', () => {
    const [t] = createTunables();
    expect(t.manifold.majorRadius).toBeCloseTo(1.0);
    expect(t.manifold.minorRadius).toBeCloseTo(0.3);
    expect(t.noise.amplitude).toBeGreaterThan(0);
    expect(t.noise.freqCap).toBeGreaterThan(0);
    expect(t.renderer.cellsWide).toBeGreaterThan(0);
    expect(t.renderer.cellsHigh).toBeGreaterThan(0);
    expect(t.renderer.fovDeg).toBeGreaterThan(0);
    expect(t.walk.walkSpeed).toBeGreaterThan(0);
    expect(t.walk.pitchClampDeg).toBeLessThan(90);
    expect(t.artifacts.countRange[0]).toBeLessThanOrEqual(t.artifacts.countRange[1]);
    expect(t.glyphs.luminanceRamp.length).toBeGreaterThan(3);
  });

  it('is reactive — set() mutations are visible via the store', () => {
    const [t, set] = createTunables();
    const before = t.walk.walkSpeed;
    set('walk', 'walkSpeed', before * 2);
    expect(t.walk.walkSpeed).toBeCloseTo(before * 2);
  });
});
