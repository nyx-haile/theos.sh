import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { materializeHeightGrid, sampleGridPeriodic } from './materialize';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('materializeHeightGrid', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(21), t);

  it('returns an NxN Float32Array', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    expect(g).toBeInstanceOf(Float32Array);
    expect(g.length).toBe(N * N);
  });

  it('grid[i, j] equals heightAt(i/N, j/N)', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    for (const i of [0, 5, 17, 31]) {
      for (const j of [0, 3, 12, 31]) {
        expect(g[i * N + j]).toBeCloseTo(m.heightAt(i / N, j / N), 5);
      }
    }
  });

  it('bilinear sample wraps at u = 1 to equal u = 0', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    for (const v of [0.1, 0.4, 0.88]) {
      expect(sampleGridPeriodic(g, N, 0, v)).toBeCloseTo(sampleGridPeriodic(g, N, 1, v), 5);
    }
  });

  it('bilinear sample wraps at v = 1 to equal v = 0', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    for (const u of [0.1, 0.4, 0.88]) {
      expect(sampleGridPeriodic(g, N, u, 0)).toBeCloseTo(sampleGridPeriodic(g, N, u, 1), 5);
    }
  });

  it('bilinear sample agrees with heightAt at non-grid points (within tolerance)', () => {
    const N = 256;
    const g = materializeHeightGrid(m, N);
    for (const [u, v] of [[0.111, 0.222], [0.577, 0.789], [0.333, 0.666]] as const) {
      expect(sampleGridPeriodic(g, N, u, v)).toBeCloseTo(m.heightAt(u, v), 2);
    }
  });
});
