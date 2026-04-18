import type { Vec3 } from '../../surface/types';
import type { Artifact } from '../../surface-game/types';
import type { Ray } from './ray';

export interface ArtifactHit {
  artifactId: number;
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** Closed-form ray-sphere intersection. Returns nearest positive hit or null. */
export function intersectArtifact(ray: Ray, center: Vec3, radius: number): { distance: number; point: Vec3; normal: Vec3 } | null {
  const ox = ray.origin[0] - center[0];
  const oy = ray.origin[1] - center[1];
  const oz = ray.origin[2] - center[2];
  const dx = ray.direction[0], dy = ray.direction[1], dz = ray.direction[2];
  const b = ox*dx + oy*dy + oz*dz;
  const c = ox*ox + oy*oy + oz*oz - radius*radius;
  const disc = b*b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  // Near intersection first.
  let tHit = -b - s;
  if (tHit < 0) tHit = -b + s;
  if (tHit <= 0) return null;
  const point: Vec3 = [ray.origin[0] + dx*tHit, ray.origin[1] + dy*tHit, ray.origin[2] + dz*tHit];
  const nmag = Math.sqrt((point[0]-center[0])**2 + (point[1]-center[1])**2 + (point[2]-center[2])**2) || 1;
  const normal: Vec3 = [(point[0]-center[0])/nmag, (point[1]-center[1])/nmag, (point[2]-center[2])/nmag];
  return { distance: tHit, point, normal };
}

export function intersectNearestArtifact(ray: Ray, artifacts: Artifact[], centers: Vec3[]): ArtifactHit | null {
  let best: ArtifactHit | null = null;
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i]!;
    const center = centers[i]!;
    const hit = intersectArtifact(ray, center, artifact.radius);
    if (hit && (best === null || hit.distance < best.distance)) {
      best = { artifactId: artifact.id, point: hit.point, normal: hit.normal, distance: hit.distance };
    }
  }
  return best;
}
