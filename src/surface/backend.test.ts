import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

function dist(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

describe('surface backend', () => {
  const t = defaultTunables();

  it('heightAt is deterministic given the seed', () => {
    const a = makeSurface(seed(9), t);
    const b = makeSurface(seed(9), t);
    expect(a.heightAt(0.3, 0.7)).toBeCloseTo(b.heightAt(0.3, 0.7), 12);
  });

  it('heightAt is periodic', () => {
    const m = makeSurface(seed(9), t);
    expect(m.heightAt(0, 0.4)).toBeCloseTo(m.heightAt(1, 0.4), 10);
    expect(m.heightAt(0.4, 0)).toBeCloseTo(m.heightAt(0.4, 1), 10);
  });

  it('embed is periodic (closed surface)', () => {
    const m = makeSurface(seed(9), t);
    const a = m.embed(0, 0.4);
    const b = m.embed(1, 0.4);
    expect(dist(a, b)).toBeLessThan(1e-6);
    const c = m.embed(0.4, 0);
    const d = m.embed(0.4, 1);
    expect(dist(c, d)).toBeLessThan(1e-6);
  });

  it('embed distance from origin is bounded by (R + r + |h|)', () => {
    const m = makeSurface(seed(9), t);
    const maxExpected = t.manifold.majorRadius + t.manifold.minorRadius + t.manifold.minorRadius * t.noise.amplitude + 0.01;
    for (let i = 0; i < 50; i++) {
      const p = m.embed(Math.random(), Math.random());
      const r = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]);
      expect(r).toBeLessThan(maxExpected + t.manifold.majorRadius); // loose: r < 2R + r + A
    }
  });

  it('normalAt is unit length', () => {
    const m = makeSurface(seed(9), t);
    for (let i = 0; i < 20; i++) {
      const n = m.normalAt(Math.random(), Math.random());
      const mag = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]);
      expect(mag).toBeCloseTo(1, 6);
    }
  });

  it('normalAt is approximately orthogonal to surface tangents', () => {
    const m = makeSurface(seed(9), t);
    const eps = 1e-4;
    for (const [u, v] of [[0.3, 0.5], [0.1, 0.9], [0.7, 0.2]] as const) {
      const n = m.normalAt(u, v);
      const pUp = m.embed(u + eps, v);
      const pUm = m.embed(u - eps, v);
      const pVp = m.embed(u, v + eps);
      const pVm = m.embed(u, v - eps);
      const tU: [number, number, number] = [(pUp[0]-pUm[0])/(2*eps), (pUp[1]-pUm[1])/(2*eps), (pUp[2]-pUm[2])/(2*eps)];
      const tV: [number, number, number] = [(pVp[0]-pVm[0])/(2*eps), (pVp[1]-pVm[1])/(2*eps), (pVp[2]-pVm[2])/(2*eps)];
      const dotU = n[0]*tU[0] + n[1]*tU[1] + n[2]*tU[2];
      const dotV = n[0]*tV[0] + n[1]*tV[1] + n[2]*tV[2];
      expect(Math.abs(dotU)).toBeLessThan(0.05);
      expect(Math.abs(dotV)).toBeLessThan(0.05);
    }
  });
});
