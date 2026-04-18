import type { ManifoldBackend, Vec3, Metric2, Christoffel2 } from './types';
import type { TunablesShape } from '../config/tunables';
import { Xoshiro256 } from '../manifold/prng';
import { createPeriodicNoise, type PeriodicNoise } from './noise';
import { makeTorusAtlas } from './atlas';

const TAU = Math.PI * 2;

interface Internals {
  R: number;
  r: number;
  A: number; // amplitude (absolute, not relative) — already r * tunables.noise.amplitude
  noise: PeriodicNoise;
}

function baseTorusPos(u: number, v: number, R: number, r: number): Vec3 {
  const ring = R + r * Math.cos(TAU * v);
  return [ring * Math.cos(TAU * u), ring * Math.sin(TAU * u), r * Math.sin(TAU * v)];
}

function baseTorusNormal(u: number, v: number): Vec3 {
  // Outward unit normal of the canonical flat torus at (u, v).
  return [
    Math.cos(TAU * v) * Math.cos(TAU * u),
    Math.cos(TAU * v) * Math.sin(TAU * u),
    Math.sin(TAU * v),
  ];
}

function heightAt(int: Internals, u: number, v: number): number {
  return int.A * int.noise.sample(u, v);
}

function embed(int: Internals, u: number, v: number): Vec3 {
  const p = baseTorusPos(u, v, int.R, int.r);
  const n = baseTorusNormal(u, v);
  const h = heightAt(int, u, v);
  return [p[0] + h * n[0], p[1] + h * n[1], p[2] + h * n[2]];
}

function normalAt(int: Internals, u: number, v: number): Vec3 {
  const eps = 1e-4;
  const pu1 = embed(int, u + eps, v);
  const pu0 = embed(int, u - eps, v);
  const pv1 = embed(int, u, v + eps);
  const pv0 = embed(int, u, v - eps);
  const tu: Vec3 = [(pu1[0]-pu0[0])/(2*eps), (pu1[1]-pu0[1])/(2*eps), (pu1[2]-pu0[2])/(2*eps)];
  const tv: Vec3 = [(pv1[0]-pv0[0])/(2*eps), (pv1[1]-pv0[1])/(2*eps), (pv1[2]-pv0[2])/(2*eps)];
  let nx = tu[1]*tv[2] - tu[2]*tv[1];
  let ny = tu[2]*tv[0] - tu[0]*tv[2];
  let nz = tu[0]*tv[1] - tu[1]*tv[0];
  const mag = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= mag; ny /= mag; nz /= mag;
  const bn = baseTorusNormal(u, v);
  if (nx*bn[0] + ny*bn[1] + nz*bn[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}

function metricAt(int: Internals, u: number, v: number): Metric2 {
  const eps = 1e-4;
  const pu1 = embed(int, u + eps, v);
  const pu0 = embed(int, u - eps, v);
  const pv1 = embed(int, u, v + eps);
  const pv0 = embed(int, u, v - eps);
  const dU: Vec3 = [(pu1[0]-pu0[0])/(2*eps), (pu1[1]-pu0[1])/(2*eps), (pu1[2]-pu0[2])/(2*eps)];
  const dV: Vec3 = [(pv1[0]-pv0[0])/(2*eps), (pv1[1]-pv0[1])/(2*eps), (pv1[2]-pv0[2])/(2*eps)];
  const guu = dU[0]*dU[0] + dU[1]*dU[1] + dU[2]*dU[2];
  const guv = dU[0]*dV[0] + dU[1]*dV[1] + dU[2]*dV[2];
  const gvv = dV[0]*dV[0] + dV[1]*dV[1] + dV[2]*dV[2];
  return [guu, guv, gvv];
}

function christoffelAt(int: Internals, u: number, v: number): Christoffel2 {
  // Γ^k_ij = 0.5 · g^{kl} · (∂_i g_{jl} + ∂_j g_{il} - ∂_l g_{ij})
  const eps = 1e-3;
  const [guu, guv, gvv] = metricAt(int, u, v);
  const det = guu*gvv - guv*guv || 1e-18;
  const iguu =  gvv / det;
  const iguv = -guv / det;
  const igvv =  guu / det;
  const [guu_up, guv_up, gvv_up] = metricAt(int, u + eps, v);
  const [guu_um, guv_um, gvv_um] = metricAt(int, u - eps, v);
  const [guu_vp, guv_vp, gvv_vp] = metricAt(int, u, v + eps);
  const [guu_vm, guv_vm, gvv_vm] = metricAt(int, u, v - eps);
  const dGuu_du = (guu_up - guu_um) / (2*eps);
  const dGuv_du = (guv_up - guv_um) / (2*eps);
  const dGvv_du = (gvv_up - gvv_um) / (2*eps);
  const dGuu_dv = (guu_vp - guu_vm) / (2*eps);
  const dGuv_dv = (guv_vp - guv_vm) / (2*eps);
  const dGvv_dv = (gvv_vp - gvv_vm) / (2*eps);

  const term = (i: 0|1, j: 0|1, l: 0|1) => {
    const dG = (wrt: 0|1, a: 0|1, b: 0|1) => {
      const key = `${a}${b}` as '00'|'01'|'10'|'11';
      const k = key === '00' ? 'uu' : (key === '11' ? 'vv' : 'uv');
      if (wrt === 0) return k === 'uu' ? dGuu_du : (k === 'vv' ? dGvv_du : dGuv_du);
      return k === 'uu' ? dGuu_dv : (k === 'vv' ? dGvv_dv : dGuv_dv);
    };
    return dG(i, j, l) + dG(j, i, l) - dG(l, i, j);
  };

  const gamma = (k: 0|1, i: 0|1, j: 0|1) => {
    const ig = (kk: 0|1, ll: 0|1) => {
      if (kk === 0 && ll === 0) return iguu;
      if (kk === 1 && ll === 1) return igvv;
      return iguv;
    };
    return 0.5 * (ig(k, 0) * term(i, j, 0) + ig(k, 1) * term(i, j, 1));
  };

  return [
    gamma(0, 0, 0),
    gamma(0, 0, 1),
    gamma(0, 1, 1),
    gamma(1, 0, 0),
    gamma(1, 0, 1),
    gamma(1, 1, 1),
  ];
}

export function makeSurface(seed: Uint8Array, tunables: TunablesShape): ManifoldBackend {
  const sub = new Uint8Array(seed);
  sub[1] = (sub[1] ?? 0) ^ 0x5C;
  const prng = new Xoshiro256(sub);
  const noise = createPeriodicNoise(prng, {
    octaves: tunables.noise.octaves,
    lacunarity: tunables.noise.lacunarity,
    gain: tunables.noise.gain,
  });
  const int: Internals = {
    R: tunables.manifold.majorRadius,
    r: tunables.manifold.minorRadius,
    A: tunables.manifold.minorRadius * tunables.noise.amplitude,
    noise,
  };
  return {
    heightAt: (u, v) => heightAt(int, u, v),
    embed:    (u, v) => embed(int, u, v),
    normalAt: (u, v) => normalAt(int, u, v),
    metricAt: (u, v) => metricAt(int, u, v),
    christoffelAt: (u, v) => christoffelAt(int, u, v),
    atlas: makeTorusAtlas(),
  };
}
