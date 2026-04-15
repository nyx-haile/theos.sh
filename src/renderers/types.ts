import type { ColorScheme } from '../color/scheme';

export type LayerKind = 'bg' | 'shadow' | 'face' | 'void';

export interface CellState {
  row: number;
  col: number;
  layer:      LayerKind;
  density:    number;
  hue:        number;
  saturation: number;
  value:      number;
  dx:         number;
  dy:         number;
  charOverride?:  string;
  colorOverride?: string;
  glyphId?: number;
  shape?:   'circle' | 'square' | 'diamond' | 'glyph';
}

export type Frame = ReadonlyArray<CellState>;

export interface RenderContext {
  readonly rows: number;
  readonly cols: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly scheme: ColorScheme;
  palette: string[];
  readonly curvField:   Float32Array;
  readonly satField:    Float32Array;
  readonly layerMask:   Int8Array;
  readonly textDensity: Uint8Array;
  rawFacePixels:        Uint8Array;
  sampleFace(col: number, row: number): number;
  readonly frame: { elapsed: number; dt: number; timePhase: number };
  readonly hc: boolean;
  asciiFont?: string;
}

export interface Renderer {
  init(ctx: RenderContext): void;
  drawFrame(frame: Frame, ctx: RenderContext): void;
  dispose(): void;
}

export type CellContributor = (cell: CellState, ctx: RenderContext) => void;

export function resetCellState(c: CellState): void {
  c.layer = 'bg';
  c.density = 0;
  c.hue = 0; c.saturation = 0; c.value = 0;
  c.dx = 0; c.dy = 0;
  c.charOverride = undefined;
  c.colorOverride = undefined;
  c.glyphId = undefined;
  c.shape = undefined;
}

export function createCellState(row: number, col: number): CellState {
  return {
    row, col,
    layer: 'bg', density: 0, hue: 0, saturation: 0, value: 0, dx: 0, dy: 0,
  };
}
