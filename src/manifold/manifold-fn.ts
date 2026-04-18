import type { GeodesicCoords, Descriptor, Seed, Tier, MutationDelta, ColorParams, ForceField, QuantizedCoords } from './types';
import { Xoshiro256 } from './prng';
import { createNoiseField } from './noise';
import { deriveTopology } from './topology';
import { computeMetricTensor, computeChristoffelSymbols } from './christoffel';

export const CELL_SIZE = 1.0;

export function quantizeCoords(coords: GeodesicCoords, cellSize = CELL_SIZE): GeodesicCoords {
  return [
    Math.round(coords[0] / cellSize) * cellSize,
    Math.round(coords[1] / cellSize) * cellSize,
    Math.round(coords[2] / cellSize) * cellSize,
  ];
}

function hashCoords(seed: Seed, coords: GeodesicCoords, registryLength: number): number {
  let hash = 2166136261;
  for (const b of seed) {
    hash = Math.imul(hash ^ b, 16777619) >>> 0;
  }
  for (const c of coords) {
    const bits = Math.round(c * 1000);
    hash = Math.imul(hash ^ (bits & 0xff), 16777619) >>> 0;
    hash = Math.imul(hash ^ ((bits >> 8) & 0xff), 16777619) >>> 0;
  }
  return hash % registryLength;
}

function applyMutations(base: ForceField, mutations: MutationDelta): ForceField {
  return mutations.reduce<ForceField>((field, m) => ({
    direction: [
      field.direction[0] + m.op.field_delta.direction[0],
      field.direction[1] + m.op.field_delta.direction[1],
      field.direction[2] + m.op.field_delta.direction[2],
    ],
    magnitude: field.magnitude + m.op.field_delta.magnitude,
  }), base);
}

export interface ManifoldFn {
  (coords: GeodesicCoords, mutations: MutationDelta, tier: Tier): Descriptor;
  readonly topology: ReturnType<typeof deriveTopology>;
}

export function createManifoldFn(seed: Seed, registryLength: number): ManifoldFn {
  const prng = new Xoshiro256(new Uint8Array(seed));
  const noiseField = createNoiseField(prng);
  const topology = deriveTopology(prng);

  function manifoldFn(coords: GeodesicCoords, mutations: MutationDelta, tier: Tier): Descriptor {
    const quantized = quantizeCoords(coords);
    const curvature_tensor = computeMetricTensor(coords, noiseField);
    const christoffel_symbols = tier < 3 ? computeChristoffelSymbols(coords, noiseField) : null;

    const content_module_id = hashCoords(seed, quantized, registryLength);

    const color_params: ColorParams = {
      hue_offset: noiseField.sample(coords[0], coords[1], coords[2]),
      saturation_scale: 0.8 + Math.abs(noiseField.sample(coords[0] + 100, coords[1], coords[2])) * 0.4,
    };

    const base_force: ForceField = {
      direction: [
        noiseField.sample(coords[0], coords[1], coords[2] + 200),
        noiseField.sample(coords[0] + 200, coords[1], coords[2]),
        noiseField.sample(coords[0], coords[1] + 200, coords[2]),
      ],
      magnitude: Math.abs(noiseField.sample(coords[0] + 400, coords[1], coords[2])),
    };

    return {
      curvature_tensor,
      christoffel_symbols,
      topology,
      content_module_id,
      color_params,
      force_field: applyMutations(base_force, mutations),
    };
  }

  Object.defineProperty(manifoldFn, 'topology', { value: topology, enumerable: true });
  return manifoldFn as ManifoldFn;
}
