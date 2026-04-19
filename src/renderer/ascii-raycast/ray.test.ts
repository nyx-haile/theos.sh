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
    const o0 = rays[0]!.origin;
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
    const center = rays[cy * vp.cellsWide + cx]!;
    const n = m.normalAt(pose.u, pose.v);
    const dot = center.direction[0]*n[0] + center.direction[1]*n[1] + center.direction[2]*n[2];
    expect(Math.abs(dot)).toBeLessThan(0.3);
  });

  it('positive yaw rotates the center ray toward screen-right (tU × n)', () => {
    const yawed = makeRays(m, { ...pose, yaw: 0.2 }, vp, t.renderer.eyeOffsetAlongNormal);
    const cx = Math.floor(vp.cellsWide / 2);
    const cy = Math.floor(vp.cellsHigh / 2);
    const center = yawed[cy * vp.cellsWide + cx]!;
    const eps = 1e-4;
    const p = m.embed(pose.u, pose.v);
    const n = m.normalAt(pose.u, pose.v);
    const pU = m.embed(pose.u + eps, pose.v);
    const dU: [number, number, number] = [(pU[0]-p[0])/eps, (pU[1]-p[1])/eps, (pU[2]-p[2])/eps];
    const dUn = dU[0]*n[0] + dU[1]*n[1] + dU[2]*n[2];
    const tU: [number, number, number] = [dU[0]-dUn*n[0], dU[1]-dUn*n[1], dU[2]-dUn*n[2]];
    const tUmag = Math.hypot(tU[0], tU[1], tU[2]) || 1;
    const tUhat: [number, number, number] = [tU[0]/tUmag, tU[1]/tUmag, tU[2]/tUmag];
    const screenRight: [number, number, number] = [
      tUhat[1]*n[2] - tUhat[2]*n[1],
      tUhat[2]*n[0] - tUhat[0]*n[2],
      tUhat[0]*n[1] - tUhat[1]*n[0],
    ];
    const dot = center.direction[0]*screenRight[0] + center.direction[1]*screenRight[1] + center.direction[2]*screenRight[2];
    expect(dot).toBeGreaterThan(0);
  });

  it('pitching up tilts the center ray toward the normal', () => {
    const rays = makeRays(m, { ...pose, pitch: Math.PI / 4 }, vp, t.renderer.eyeOffsetAlongNormal);
    const cx = Math.floor(vp.cellsWide / 2);
    const cy = Math.floor(vp.cellsHigh / 2);
    const center = rays[cy * vp.cellsWide + cx]!;
    const n = m.normalAt(pose.u, pose.v);
    const dot = center.direction[0]*n[0] + center.direction[1]*n[1] + center.direction[2]*n[2];
    expect(dot).toBeGreaterThan(0.5);
  });
});
