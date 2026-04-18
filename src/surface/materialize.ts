import type { ManifoldBackend } from './types';

/** Flat NxN grid of h(u, v) samples at (i/N, j/N). Index: i*N + j. */
export function materializeHeightGrid(m: ManifoldBackend, N: number): Float32Array {
  const out = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const rowOff = i * N;
    for (let j = 0; j < N; j++) {
      out[rowOff + j] = m.heightAt(u, j / N);
    }
  }
  return out;
}

function wrap01(x: number): number {
  const w = x - Math.floor(x);
  return w === 1 ? 0 : w;
}

/** Bilinear sample of a periodic height grid at continuous (u, v) ∈ ℝ. */
export function sampleGridPeriodic(g: Float32Array, N: number, u: number, v: number): number {
  const uu = wrap01(u) * N;
  const vv = wrap01(v) * N;
  const i0 = Math.floor(uu) % N;
  const j0 = Math.floor(vv) % N;
  const i1 = (i0 + 1) % N;
  const j1 = (j0 + 1) % N;
  const fu = uu - Math.floor(uu);
  const fv = vv - Math.floor(vv);
  const h00 = g[i0 * N + j0]!;
  const h01 = g[i0 * N + j1]!;
  const h10 = g[i1 * N + j0]!;
  const h11 = g[i1 * N + j1]!;
  const h0 = h00 * (1 - fv) + h01 * fv;
  const h1 = h10 * (1 - fv) + h11 * fv;
  return h0 * (1 - fu) + h1 * fu;
}
