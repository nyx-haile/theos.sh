export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ScribeToken {
  /** Persistent identity. It must not be derived from the token's current offset. */
  id: string;
  grapheme: string;
  /** UTF-16 offsets into the editable source string. */
  sourceStart: number;
  sourceEnd: number;
}

export type ScribeQuality = 'lite' | 'full';
export type ScribeOpticalProfile = 'micro' | 'text' | 'display';
/** @deprecated Prefer the more explicit ScribeOpticalProfile name. */
export type ScribeProfile = ScribeOpticalProfile;

export interface ScribeInput {
  tokens: readonly ScribeToken[];
  seed: Uint8Array;
  pxPerEm: number;
  maxWidth: number;
  quality: ScribeQuality;
}

export interface PenPoint extends Vec2 {
  /** Seconds since the start of this render. */
  time: number;
  /** Unitless simulated nib pressure in [0, 1]. */
  pressure: number;
  /** Render-space half-width of the deposited stroke. */
  radius: number;
  /** Token ids whose selection geometry owns this point. */
  owners: readonly string[];
}

export interface StrokeMesh {
  /** Interleaved x/y positions, two vertices per spine sample. */
  positions: Float32Array;
  indices: Uint32Array;
  /** One owner list per indexed triangle. */
  triangleOwners: readonly (readonly string[])[];
  /** Closed selection/rasterization contour. */
  outline: readonly Vec2[];
}

export interface PenStroke {
  id: string;
  points: readonly PenPoint[];
  mesh: StrokeMesh;
  bounds: Rect;
}

export interface CaretSlot extends Vec2 {
  index: number;
  sourceOffset: number;
  top: number;
  bottom: number;
  beforeTokenId?: string;
  afterTokenId?: string;
}

export interface SelectionEnvelope {
  tokenId: string;
  sourceStart: number;
  sourceEnd: number;
  kind: 'ink' | 'advance';
  polygon: readonly Vec2[];
  bounds: Rect;
}

export interface ScribeRun {
  strokes: readonly PenStroke[];
  carets: readonly CaretSlot[];
  selectionEnvelopes: readonly SelectionEnvelope[];
  bounds: Rect;
  profile: ScribeProfile;
  sampleCount: number;
}

export interface OpticalParameters {
  profile: ScribeProfile;
  /** Geometric detail multiplier for loops and counters. */
  loopDetail: number;
  /** How aggressively small counters are opened. */
  counterOpen: number;
  /** Minimum and maximum motor pressure. */
  pressureRange: number;
  /** Amplitude of deterministic edge texture, in em. */
  texture: number;
  /** Nominal nib radius, in em. */
  strokeScale: number;
}

export interface ReconcileScribeTokenOptions {
  namespace?: string;
  nextId?: number;
}

export interface ReconciledScribeTokens {
  tokens: ScribeToken[];
  nextId: number;
}

export interface ScribeTokenReconcilerOptions extends ReconcileScribeTokenOptions {
  initialTokens?: readonly ScribeToken[];
}
