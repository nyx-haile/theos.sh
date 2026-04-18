import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { Artifact, Pose, Frame } from '../../surface-game/types';
import type { TunablesShape } from '../../config/tunables';
import { makeRays } from './ray';
import { marchTerrain } from './march';
import { intersectNearestArtifact } from './artifact-intersect';
import { luminanceGlyph, artifactGlyph } from './glyphs';

function dot(a: Vec3, b: Vec3): number { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

export function renderFrame(
  m: ManifoldBackend,
  artifacts: Artifact[],
  pose: Pose,
  t: TunablesShape,
  heightSampler?: (u: number, v: number) => number,
): Frame {
  const vp = { cellsWide: t.renderer.cellsWide, cellsHigh: t.renderer.cellsHigh, fovDeg: t.renderer.fovDeg };
  const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);

  // Precompute artifact world centers.
  const centers: Vec3[] = artifacts.map(a => {
    const p = m.embed(a.u, a.v);
    const n = m.normalAt(a.u, a.v);
    return [p[0] + a.offset*n[0], p[1] + a.offset*n[1], p[2] + a.offset*n[2]];
  });

  const sceneScale = t.manifold.majorRadius + t.manifold.minorRadius;
  const glyphs: string[] = new Array(vp.cellsWide * vp.cellsHigh);

  for (let k = 0; k < rays.length; k++) {
    const ray = rays[k]!;  // bounded by rays.length
    const terrainHit = marchTerrain(ray, m, t, heightSampler);
    const artifactHit = intersectNearestArtifact(ray, artifacts, centers);

    // Choose nearer hit (both may be null, one may be null).
    let chosen: 'terrain' | 'artifact' | 'none' = 'none';
    if (terrainHit && artifactHit) {
      chosen = terrainHit.distance < artifactHit.distance ? 'terrain' : 'artifact';
    } else if (terrainHit) {
      chosen = 'terrain';
    } else if (artifactHit) {
      chosen = 'artifact';
    }

    if (chosen === 'terrain' && terrainHit) {
      const lambert = Math.max(0, -dot(terrainHit.normal, ray.direction));
      const grazing = 1 - Math.abs(dot(terrainHit.normal, ray.direction));
      const shaded = lambert * (1 - t.renderer.silhouetteBoost) + grazing * t.renderer.silhouetteBoost;
      const falloff = 1 / (1 + t.renderer.distanceFalloffK * terrainHit.distance);
      // Iso-height contour band in world-z; peaks of |sin| darken glyph to reveal curvature.
      const band = t.renderer.contourFreq > 0
        ? Math.abs(Math.sin(terrainHit.point[2] * t.renderer.contourFreq * Math.PI))
        : 0;
      const contour = 1 - t.renderer.contourStrength * band;
      glyphs[k] = luminanceGlyph(shaded * falloff * contour, t.glyphs.luminanceRamp);
    } else if (chosen === 'artifact' && artifactHit) {
      glyphs[k] = artifactGlyph(artifactHit.distance, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, sceneScale);
    } else {
      glyphs[k] = ' ';
    }
  }

  return { glyphs, cellsWide: vp.cellsWide, cellsHigh: vp.cellsHigh };
}
