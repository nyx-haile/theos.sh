import type { Atlas } from './types';

function wrap01(x: number): number {
  // Floor-mod: result is in [0, 1) for all real inputs.
  const w = x - Math.floor(x);
  return w === 1 ? 0 : w;
}

export function makeTorusAtlas(): Atlas {
  return {
    charts: [{ id: 0 }],
    wrapPosition(chart: number, u: number, v: number) {
      // A1 single-chart torus: transition function is identity, so we just wrap.
      // A3 (multi-patch, bead theos.sh-57n) will replace this with real gluing.
      return { chart: 0, u: wrap01(u), v: wrap01(v) };
    },
  };
}
