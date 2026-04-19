import { describe, it, expect } from 'vitest';
import { createPlayer, faceTargetPose, stepPlayer, applyKeys } from './player';
import { makeRays } from '../renderer/ascii-raycast/ray';
import { makePose } from './types';
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

  it('D strafes the player along screen-right (tU × n direction)', () => {
    const p = createPlayer(0.5, 0.5);
    const p0 = m.embed(p.pose.u, p.pose.v);
    const eps = 1e-4;
    const n = m.normalAt(p.pose.u, p.pose.v);
    const pU = m.embed(p.pose.u + eps, p.pose.v);
    const dU: [number, number, number] = [(pU[0]-p0[0])/eps, (pU[1]-p0[1])/eps, (pU[2]-p0[2])/eps];
    const dUn = dU[0]*n[0] + dU[1]*n[1] + dU[2]*n[2];
    const tU: [number, number, number] = [dU[0]-dUn*n[0], dU[1]-dUn*n[1], dU[2]-dUn*n[2]];
    const tUmag = Math.hypot(tU[0], tU[1], tU[2]) || 1;
    const tUhat: [number, number, number] = [tU[0]/tUmag, tU[1]/tUmag, tU[2]/tUmag];
    // screen-right = tU × n (right-handed: forward = tU, up = n, right = forward × up)
    const screenRight: [number, number, number] = [
      tUhat[1]*n[2] - tUhat[2]*n[1],
      tUhat[2]*n[0] - tUhat[0]*n[2],
      tUhat[0]*n[1] - tUhat[1]*n[0],
    ];
    stepPlayer(p, m, t, applyKeys({ d: true }), 0.05);
    const p1 = m.embed(p.pose.u, p.pose.v);
    const disp: [number, number, number] = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
    const dot = disp[0]*screenRight[0] + disp[1]*screenRight[1] + disp[2]*screenRight[2];
    expect(dot).toBeGreaterThan(0);
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

  it('faceTargetPose orients view forward at the target', () => {
    const target: [number, number, number] = [0, 0, 0];
    const u = 0, v = 0.25;
    const eye = t.renderer.eyeOffsetAlongNormal;
    const { yaw, pitch } = faceTargetPose(m, u, v, target, eye);
    const pose = { ...makePose(u, v, yaw, pitch) };
    const ray = makeRays(m, pose, { cellsWide: 1, cellsHigh: 1, fovDeg: 1 }, eye)[0]!;
    const dx = target[0] - ray.origin[0];
    const dy = target[1] - ray.origin[1];
    const dz = target[2] - ray.origin[2];
    const dmag = Math.hypot(dx, dy, dz);
    const cos = (ray.direction[0]*dx + ray.direction[1]*dy + ray.direction[2]*dz) / dmag;
    expect(cos).toBeGreaterThan(0.999);
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
