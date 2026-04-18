import { describe, it, expect } from 'vitest';
import { createPlayer, stepPlayer, applyKeys } from './player';
import { makeSurface } from '../surface/backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('player K2 + C1', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(29), t);

  it('initializes at the configured pose', () => {
    const p = createPlayer(0.25, 0.75);
    expect(p.pose.u).toBeCloseTo(0.25);
    expect(p.pose.v).toBeCloseTo(0.75);
    expect(p.pose.yaw).toBe(0);
    expect(p.pose.pitch).toBe(-0.3);
    expect(p.pose.chart).toBe(0);
  });

  it('W advances the player in the view direction', () => {
    const p = createPlayer(0.5, 0.5);
    const before = { ...p.pose };
    stepPlayer(p, m, t, applyKeys({ w: true }), 1.0);
    const moved = Math.abs(p.pose.u - before.u) + Math.abs(p.pose.v - before.v);
    expect(moved).toBeGreaterThan(0);
  });

  it('S moves the opposite direction of W', () => {
    const pW = createPlayer(0.5, 0.5);
    const pS = createPlayer(0.5, 0.5);
    // Small step so the two geodesics from the same seed point are still
    // close to mirror images — C3 propagation diverges for large dt when
    // the surface is curved.
    stepPlayer(pW, m, t, applyKeys({ w: true }), 0.05);
    stepPlayer(pS, m, t, applyKeys({ s: true }), 0.05);
    const sumU = (pW.pose.u - 0.5) + (pS.pose.u - 0.5);
    const sumV = (pW.pose.v - 0.5) + (pS.pose.v - 0.5);
    expect(Math.abs(sumU)).toBeLessThan(1e-3);
    expect(Math.abs(sumV)).toBeLessThan(1e-3);
  });

  it('Q decreases yaw, E increases yaw', () => {
    const pQ = createPlayer(0.5, 0.5);
    const pE = createPlayer(0.5, 0.5);
    stepPlayer(pQ, m, t, applyKeys({ q: true }), 1.0);
    stepPlayer(pE, m, t, applyKeys({ e: true }), 1.0);
    expect(pQ.pose.yaw).toBeLessThan(0);
    expect(pE.pose.yaw).toBeGreaterThan(0);
  });

  it('R increases pitch, F decreases pitch, both clamp at ±clamp', () => {
    const p = createPlayer(0.5, 0.5);
    stepPlayer(p, m, t, applyKeys({ r: true }), 10.0); // way more than clamp range
    const clampRad = (t.walk.pitchClampDeg * Math.PI) / 180;
    expect(p.pose.pitch).toBeCloseTo(clampRad, 5);
    stepPlayer(p, m, t, applyKeys({ f: true }), 20.0);
    expect(p.pose.pitch).toBeCloseTo(-clampRad, 5);
  });

  it('walking off u=1 wraps back to u near 0', () => {
    const p = createPlayer(0.99, 0.5);
    // Point yaw toward +u direction (yaw=0) and walk a long step.
    stepPlayer(p, m, t, applyKeys({ w: true }), 5.0);
    expect(p.pose.u).toBeGreaterThanOrEqual(0);
    expect(p.pose.u).toBeLessThan(1);
  });

  it('yaw wraps mod 2π', () => {
    const p = createPlayer(0.5, 0.5);
    stepPlayer(p, m, t, applyKeys({ e: true }), 100.0);
    expect(p.pose.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(p.pose.yaw).toBeLessThanOrEqual(Math.PI);
  });

  it('C3: a W step traverses ~walkSpeed·dt of world-space arc length', () => {
    // Chord ≤ arc-length, and for small dt they agree; verify the chord is
    // a substantial fraction of the target arc so the geodesic integrator
    // isn't silently stalling or overshooting.
    const p = createPlayer(0.5, 0.5);
    const p0 = m.embed(p.pose.u, p.pose.v);
    const dt = 0.1;
    stepPlayer(p, m, t, applyKeys({ w: true }), dt);
    const p1 = m.embed(p.pose.u, p.pose.v);
    const chord = Math.hypot(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]);
    const target = t.walk.walkSpeed * dt;
    expect(chord).toBeGreaterThan(0.8 * target);
    expect(chord).toBeLessThanOrEqual(target + 1e-6);
  });
});
