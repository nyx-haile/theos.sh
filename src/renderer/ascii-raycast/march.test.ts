import { describe, it, expect } from 'vitest';
import { marchTerrain } from './march';
import { makeSurface } from '../../surface/backend';
import { makeRays } from './ray';
import { defaultTunables } from '../../config/tunables';
import { makePose } from '../../surface-game/types';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('marchTerrain', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(3), t);

  it('a ray pointing straight up from the eye misses the terrain', () => {
    const pose = makePose(0.3, 0.4, 0, Math.PI / 2 - 0.01);
    const rays = makeRays(m, pose, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal);
    const hit = marchTerrain(rays[0]!, m, t);
    expect(hit).toBeNull();
  });

  it('a ray pointing into the surface hits within a few steps', () => {
    const pose = makePose(0.3, 0.4, 0, -Math.PI / 2 + 0.01);
    const rays = makeRays(m, pose, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal);
    const hit = marchTerrain(rays[0]!, m, t);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.distance).toBeGreaterThan(0);
      expect(hit.distance).toBeLessThan(1.0);
    }
  });

  it('coarse-rejects rays whose bounding-sphere miss is provable', () => {
    // Eye 100 units above origin, direction straight up — bounding sphere far
    // below, ray can never reach it. Must return null without touching march.
    const R = t.manifold.majorRadius, r = t.manifold.minorRadius, A = r * t.noise.amplitude;
    const B = R + r + A;
    const ray = { origin: [0, 0, 10 * B] as [number, number, number], direction: [0, 0, 1] as [number, number, number] };
    expect(marchTerrain(ray, m, t)).toBeNull();
  });

  it('coarse-rejects rays pointing away from the bounding sphere', () => {
    const R = t.manifold.majorRadius, r = t.manifold.minorRadius, A = r * t.noise.amplitude;
    const B = R + r + A;
    // Ray originates well past the sphere and points further away.
    const ray = { origin: [10 * B, 0, 0] as [number, number, number], direction: [1, 0, 0] as [number, number, number] };
    expect(marchTerrain(ray, m, t)).toBeNull();
  });

  it('still hits when ray starts far outside but points at the torus', () => {
    const R = t.manifold.majorRadius;
    // Ray from far +X, aimed at origin — must traverse free space then hit.
    const start: [number, number, number] = [R * 4, 0, 0];
    const dir: [number, number, number] = [-1, 0, 0];
    const hit = marchTerrain({ origin: start, direction: dir }, m, t);
    expect(hit).not.toBeNull();
  });

  it('hits at different points for different yaws', () => {
    const poseA = makePose(0.3, 0.4, 0, 0);
    const poseB = makePose(0.3, 0.4, Math.PI, 0);
    const rA = makeRays(m, poseA, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal)[0]!;
    const rB = makeRays(m, poseB, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal)[0]!;
    const hA = marchTerrain(rA, m, t);
    const hB = marchTerrain(rB, m, t);
    if (hA && hB) {
      const dx = hA.point[0] - hB.point[0];
      const dy = hA.point[1] - hB.point[1];
      const dz = hA.point[2] - hB.point[2];
      expect(Math.sqrt(dx*dx + dy*dy + dz*dz)).toBeGreaterThan(0.05);
    }
  });
});
