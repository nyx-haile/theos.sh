import type { Vec3 } from '../../surface/types';
import type { TunablesShape } from '../../config/tunables';
import type { Ray } from './ray';

export interface TitleMarker {
  center: Vec3;
  text: string;
  heightWorld: number;   // full vertical extent of the glyph band in world units
  charAdvance: number;   // horizontal cell width per character, in units of heightWorld
  revealPerCharMs: number;
}

export interface TitleHit {
  distance: number;
  glyph: string;
  charIndex: number;
}

export function createTitleMarker(t: TunablesShape): TitleMarker {
  return {
    center: [0, 0, 0],
    text: 'theos.sh',
    heightWorld: t.manifold.minorRadius * 1.1,
    charAdvance: 0.6,
    revealPerCharMs: 220,
  };
}

export function isTitleCharRevealed(marker: TitleMarker, charIndex: number, elapsedMs: number): boolean {
  return elapsedMs >= charIndex * marker.revealPerCharMs;
}

/** Spherical billboard: quad always faces the player, up axis pinned to world +Z. */
export function intersectTitle(ray: Ray, marker: TitleMarker, playerPos: Vec3): TitleHit | null {
  const cx = marker.center[0], cy = marker.center[1], cz = marker.center[2];
  let nx = playerPos[0] - cx, ny = playerPos[1] - cy, nz = playerPos[2] - cz;
  const nmag = Math.sqrt(nx*nx + ny*ny + nz*nz);
  if (nmag < 1e-6) return null;
  nx /= nmag; ny /= nmag; nz /= nmag;

  const denom = ray.direction[0]*nx + ray.direction[1]*ny + ray.direction[2]*nz;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((cx - ray.origin[0])*nx + (cy - ray.origin[1])*ny + (cz - ray.origin[2])*nz) / denom;
  if (t <= 0) return null;

  const px = ray.origin[0] + ray.direction[0]*t;
  const py = ray.origin[1] + ray.direction[1]*t;
  const pz = ray.origin[2] + ray.direction[2]*t;

  // right = up_world × n, with up_world = (0,0,1). Fall back to +X when n is vertical.
  let rx = -ny, ry = nx, rz = 0;
  let rmag = Math.sqrt(rx*rx + ry*ry + rz*rz);
  if (rmag < 1e-6) { rx = 1; ry = 0; rz = 0; rmag = 1; }
  rx /= rmag; ry /= rmag; rz /= rmag;
  // up = n × right
  const ux = ny*rz - nz*ry;
  const uy = nz*rx - nx*rz;
  const uz = nx*ry - ny*rx;

  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const localU = dx*rx + dy*ry + dz*rz;
  const localV = dx*ux + dy*uy + dz*uz;

  const halfH = marker.heightWorld * 0.5;
  const halfW = halfH * marker.charAdvance * marker.text.length;
  if (localU < -halfW || localU > halfW) return null;
  if (localV < -halfH || localV > halfH) return null;

  const n = marker.text.length;
  const colF = (localU + halfW) / (2 * halfW) * n;
  const charIndex = Math.max(0, Math.min(n - 1, Math.floor(colF)));
  const glyph = marker.text[charIndex]!;
  if (glyph === ' ') return null;
  return { distance: t, glyph, charIndex };
}
