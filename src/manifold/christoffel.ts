import type { GeodesicCoords } from './types';
import type { NoiseField } from './noise';

const EPSILON = 0.1;
const H = 0.001; // finite difference step size

export function computeMetricTensor(
  coords: GeodesicCoords,
  noiseField: NoiseField
): number[][] {
  const [x, y, z] = coords;
  const phi = noiseField.sample(x, y, z) * EPSILON;

  // g_ij = δ_ij + ε · Φ(x, seed)  (isotropic perturbation)
  return [
    [1 + phi, 0, 0],
    [0, 1 + phi, 0],
    [0, 0, 1 + phi],
  ];
}

function metricComponent(
  coords: GeodesicCoords,
  i: number,
  j: number,
  noiseField: NoiseField
): number {
  return computeMetricTensor(coords, noiseField)[i]![j]!;
}

function metricDerivative(
  coords: GeodesicCoords,
  i: number,
  j: number,
  k: number,
  noiseField: NoiseField
): number {
  const plus = [...coords] as GeodesicCoords;
  const minus = [...coords] as GeodesicCoords;
  plus[k] += H;
  minus[k] -= H;
  return (metricComponent(plus, i, j, noiseField) - metricComponent(minus, i, j, noiseField)) / (2 * H);
}

function invertDiagonalMetric(g: number[][]): number[][] {
  return [
    [1 / g[0]![0]!, 0, 0],
    [0, 1 / g[1]![1]!, 0],
    [0, 0, 1 / g[2]![2]!],
  ];
}

// Γ^μ_αβ = ½ g^μν (∂_α g_νβ + ∂_β g_να − ∂_ν g_αβ)
export function computeChristoffelSymbols(
  coords: GeodesicCoords,
  noiseField: NoiseField
): number[][][] {
  const g = computeMetricTensor(coords, noiseField);
  const gInv = invertDiagonalMetric(g);
  const n = 3;

  const Gamma: number[][][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => new Array<number>(n).fill(0))
  );

  for (let mu = 0; mu < n; mu++) {
    for (let alpha = 0; alpha < n; alpha++) {
      for (let beta = 0; beta < n; beta++) {
        let sum = 0;
        for (let nu = 0; nu < n; nu++) {
          const dA = metricDerivative(coords, nu, beta, alpha, noiseField);
          const dB = metricDerivative(coords, nu, alpha, beta, noiseField);
          const dN = metricDerivative(coords, alpha, beta, nu, noiseField);
          sum += gInv[mu]![nu]! * (dA + dB - dN);
        }
        Gamma[mu]![alpha]![beta] = 0.5 * sum;
      }
    }
  }

  return Gamma;
}
