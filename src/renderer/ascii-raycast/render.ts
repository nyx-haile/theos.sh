import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { Artifact, Pose, Frame, ShadedCell, HitKind } from '../../surface-game/types';
import type { TunablesShape } from '../../config/tunables';
import { makeRays } from './ray';
import { marchTerrain } from './march';
import { intersectNearestArtifact } from './artifact-intersect';
import { luminanceGlyph, artifactGlyph } from './glyphs';
import { intersectTitle, isTitleCharRevealed, type TitleMarker } from './title';

function dot(a: Vec3, b: Vec3): number { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

export function renderFrame(
  m: ManifoldBackend,
  artifacts: Artifact[],
  pose: Pose,
  t: TunablesShape,
  heightSampler?: (u: number, v: number) => number,
  title?: TitleMarker,
  elapsedMs?: number,
): Frame {
  const vp = { cellsWide: t.renderer.cellsWide, cellsHigh: t.renderer.cellsHigh, fovDeg: t.renderer.fovDeg };
  const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);

  const centers: Vec3[] = artifacts.map(a => {
    const p = m.embed(a.u, a.v);
    const n = m.normalAt(a.u, a.v);
    return [p[0] + a.offset*n[0], p[1] + a.offset*n[1], p[2] + a.offset*n[2]];
  });

  const playerPos: Vec3 = (() => {
    const p = m.embed(pose.u, pose.v);
    const n = m.normalAt(pose.u, pose.v);
    const k = t.renderer.eyeOffsetAlongNormal;
    return [p[0] + k*n[0], p[1] + k*n[1], p[2] + k*n[2]];
  })();

  const sceneScale = t.manifold.majorRadius + t.manifold.minorRadius;
  const cells: ShadedCell[] = new Array(vp.cellsWide * vp.cellsHigh);
  const now = elapsedMs ?? 0;

  for (let k = 0; k < rays.length; k++) {
    const ray = rays[k]!;
    const terrainHit = marchTerrain(ray, m, t, heightSampler);
    const artifactHit = intersectNearestArtifact(ray, artifacts, centers);
    const titleHit = title ? intersectTitle(ray, title, playerPos) : null;
    const titleReady = title && titleHit ? isTitleCharRevealed(title, titleHit.charIndex, now) : false;

    let chosen: HitKind = 'sky';
    let bestDist = Infinity;
    if (terrainHit && terrainHit.distance < bestDist) { chosen = 'terrain'; bestDist = terrainHit.distance; }
    if (artifactHit && artifactHit.distance < bestDist) { chosen = 'artifact'; bestDist = artifactHit.distance; }
    if (titleReady && titleHit && titleHit.distance < bestDist) { chosen = 'title'; bestDist = titleHit.distance; }

    if (chosen === 'terrain' && terrainHit) {
      const lambert = Math.max(0, -dot(terrainHit.normal, ray.direction));
      const grazing = 1 - Math.abs(dot(terrainHit.normal, ray.direction));
      const shaded = lambert * (1 - t.renderer.silhouetteBoost) + grazing * t.renderer.silhouetteBoost;
      const falloff = 1 / (1 + t.renderer.distanceFalloffK * terrainHit.distance);
      const band = t.renderer.contourFreq > 0
        ? Math.abs(Math.sin(terrainHit.point[2] * t.renderer.contourFreq * Math.PI))
        : 0;
      const contour = 1 - t.renderer.contourStrength * band;
      const luminance = Math.max(0, Math.min(1, shaded * falloff * contour));
      cells[k] = {
        glyph: luminanceGlyph(luminance, t.glyphs.luminanceRamp),
        luminance,
        hitKind: 'terrain',
        depth: Math.min(1, terrainHit.distance / sceneScale),
      };
    } else if (chosen === 'artifact' && artifactHit) {
      const proximity = Math.max(0, Math.min(1, 1 - artifactHit.distance / sceneScale));
      cells[k] = {
        glyph: artifactGlyph(artifactHit.distance, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, sceneScale),
        luminance: proximity,
        hitKind: 'artifact',
        depth: Math.min(1, artifactHit.distance / sceneScale),
      };
    } else if (chosen === 'title' && titleHit) {
      const proximity = Math.max(0, Math.min(1, 1 - titleHit.distance / sceneScale));
      cells[k] = {
        glyph: titleHit.glyph,
        luminance: proximity,
        hitKind: 'title',
        depth: Math.min(1, titleHit.distance / sceneScale),
      };
    } else {
      cells[k] = { glyph: ' ', luminance: 0, hitKind: 'sky', depth: 1 };
    }
  }

  return { cells, cellsWide: vp.cellsWide, cellsHigh: vp.cellsHigh };
}
