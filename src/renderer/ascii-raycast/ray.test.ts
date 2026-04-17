import { describe, it, expect } from 'vitest';
import { makeRays } from './ray';
import { makePose } from '../../surface-game/types';
import { makeSurface } from '../../surface/backend';
import { defaultTunables } from '../../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('makeRays', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(1), t);
  const pose = makePose(0.5, 0.5, 0, 0);
  const vp = { cellsWide: 8, cellsHigh: 4, fovDeg: 70 };

  it('returns cellsWide * cellsHigh rays', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    expect(rays.length).toBe(vp.cellsWide * vp.cellsHigh);
  });

  it('all rays share the same origin (the eye)', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    const o0 = rays[0].origin;
    for (const r of rays) {
      expect(r.origin[0]).toBeCloseTo(o0[0], 10);
      expect(r.origin[1]).toBeCloseTo(o0[1], 10);
      expect(r.origin[2]).toBeCloseTo(o0[2], 10);
    }
  });

  it('every ray direction is unit length', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    for (const r of rays) {
      const d = r.direction;
      const mag = Math.sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2]);
      expect(mag).toBeCloseTo(1, 6);
    }
  });

  it('center ray points roughly along the view-forward tangent', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    const cx = Math.floor(vp.cellsWide / 2);
    const cy = Math.floor(vp.cellsHigh / 2);
    const center = rays[cy * vp.cellsWide + cx];
    const n = m.normalAt(pose.u, pose.v);
    const dot = center.direction[0]*n[0] + center.direction[1]*n[1] + center.direction[2]*n[2];
    expect(Math.abs(dot)).toBeLessThan(0.3);
  });

  it('pitching up tilts the center ray toward the normal', () => {
    const rays = makeRays(m, { ...pose, pitch: Math.PI / 4 }, vp, t.renderer.eyeOffsetAlongNormal);
    const cx = Math.floor(vp.cellsWide / 2);
    const cy = Math.floor(vp.cellsHigh / 2);
    const center = rays[cy * vp.cellsWide + cx];
    const n = m.normalAt(pose.u, pose.v);
    const dot = center.direction[0]*n[0] + center.direction[1]*n[1] + center.direction[2]*n[2];
    expect(dot).toBeGreaterThan(0.5);
  });
});
