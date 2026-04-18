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
    stepPlayer(pW, m, t, applyKeys({ w: true }), 1.0);
    stepPlayer(pS, m, t, applyKeys({ s: true }), 1.0);
    // Displacements should be roughly opposite (sum near zero).
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
});
