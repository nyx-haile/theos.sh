import { describe, it, expect } from 'vitest';
import { intersectArtifact, intersectNearestArtifact } from './artifact-intersect';
import type { Artifact } from '../../surface-game/types';
import type { Ray } from './ray';

describe('ray vs artifact', () => {
  it('returns null when the ray misses the sphere', () => {
    const art: Artifact = { id: 0, u: 0, v: 0, offset: 0, radius: 0.1, spikes: 4 };
    const center: [number, number, number] = [2, 2, 2];
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    expect(intersectArtifact(ray, center, art.radius)).toBeNull();
  });

  it('returns a positive distance when ray hits sphere', () => {
    const center: [number, number, number] = [5, 0, 0];
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    const hit = intersectArtifact(ray, center, 1.0);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.distance).toBeCloseTo(4.0, 3);
    }
  });

  it('ignores hits behind the ray origin', () => {
    const center: [number, number, number] = [-5, 0, 0];
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    expect(intersectArtifact(ray, center, 1.0)).toBeNull();
  });

  it('nearest-of-many picks the closest hit', () => {
    const centers: Array<[number, number, number]> = [[8, 0, 0], [3, 0, 0], [15, 0, 0]];
    const arts: Artifact[] = centers.map((_, i) => ({ id: i, u: 0, v: 0, offset: 0, radius: 0.5, spikes: 4 }));
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    const hit = intersectNearestArtifact(ray, arts, centers);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.artifactId).toBe(1);
    }
  });
});
