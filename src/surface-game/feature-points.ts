export interface FeaturePoint {
  u: number;
  v: number;
  score: number;
}

/** Chebyshev (L∞) distance on the periodic (u,v) square. Result in [0, 0.5]. */
export function toroidalChebyshev(u1: number, v1: number, u2: number, v2: number): number {
  const du = Math.abs(u1 - u2);
  const dv = Math.abs(v1 - v2);
  const duP = Math.min(du, 1 - du);
  const dvP = Math.min(dv, 1 - dv);
  return Math.max(duP, dvP);
}

/** Grid-scan the height field at resolution N and return the local extrema
 *  (maxima and minima) against their 8 periodic neighbors. Sorted by
 *  descending |h| so the strongest "features" come first. */
export function findExtremaCandidates(
  heightFn: (u: number, v: number) => number,
  gridN: number,
): FeaturePoint[] {
  if (gridN < 3) return [];
  const grid = new Float32Array(gridN * gridN);
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      grid[j * gridN + i] = heightFn(i / gridN, j / gridN);
    }
  }
  const at = (i: number, j: number) => {
    const ii = ((i % gridN) + gridN) % gridN;
    const jj = ((j % gridN) + gridN) % gridN;
    return grid[jj * gridN + ii]!;
  };

  const out: FeaturePoint[] = [];
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const c = at(i, j);
      let isMax = true, isMin = true;
      for (let dj = -1; dj <= 1 && (isMax || isMin); dj++) {
        for (let di = -1; di <= 1 && (isMax || isMin); di++) {
          if (di === 0 && dj === 0) continue;
          const n = at(i + di, j + dj);
          if (c <= n) isMax = false;
          if (c >= n) isMin = false;
        }
      }
      if (isMax || isMin) {
        out.push({ u: i / gridN, v: j / gridN, score: Math.abs(c) });
      }
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Greedy top-N selection: scan candidates in descending-score order, accept
 *  if no already-kept point is within minSep (Chebyshev, periodic). Returns
 *  fewer than n when the separation constraint cannot be met. */
export function pickWithMinSeparation(
  candidates: readonly FeaturePoint[],
  n: number,
  minSep: number,
): FeaturePoint[] {
  const kept: FeaturePoint[] = [];
  for (const c of candidates) {
    if (kept.length >= n) break;
    let tooClose = false;
    for (const k of kept) {
      if (toroidalChebyshev(c.u, c.v, k.u, k.v) < minSep) { tooClose = true; break; }
    }
    if (!tooClose) kept.push(c);
  }
  return kept;
}
