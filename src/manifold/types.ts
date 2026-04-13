export type GeodesicCoords = [number, number, number];
export type QuantizedCoords = `${number},${number},${number}`;
export type TangentVector = [number, number, number];
export type Seed = Uint8Array; // 32 bytes = 256 bits
export type Tier = 1 | 2 | 3;

export interface BoundingVolume {
  center: GeodesicCoords;
  radius: number;
}

export interface Topology {
  genus: number;
  wormhole_pairs: Array<[GeodesicCoords, GeodesicCoords]>;
}

export interface ColorParams {
  hue_offset: number;       // normalized [-1, 1]; multiply by 180 for degrees
  saturation_scale: number; // [0.5, 1.5]
}

export interface ForceField {
  direction: [number, number, number];
  magnitude: number;
}

export interface Descriptor {
  curvature_tensor: number[][];
  christoffel_symbols: number[][][] | null; // null in Tier 3
  topology: Topology;
  content_module_id: number;
  color_params: ColorParams;
  force_field: ForceField;
}

export interface CapabilityMask {
  tier: Tier;
  device_pixel_ratio: number;
}

export interface ViewportOp {
  type: 'ViewportOp';
  kind: 'translate' | 'rotate' | 'wormhole_jump';
  magnitude: number;
  direction?: TangentVector;
}

export interface ObjectOp {
  type: 'ObjectOp';
  selection_criteria: 'nearest' | 'random_visible' | 'furthest';
}

export interface ForceOp {
  type: 'ForceOp';
  field_delta: ForceField;
}

export type ManifoldOp = ViewportOp | ObjectOp | ForceOp;

export interface Mutation {
  op: ForceOp;
  coords: QuantizedCoords;
  timestamp: number;
}

export type MutationDelta = Mutation[];

export interface InputEvent {
  type: 'keydown' | 'click' | 'scroll' | 'drag';
  key?: string;
}
