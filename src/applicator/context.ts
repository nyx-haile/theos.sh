import type { RenderContext } from '../renderers/types';
import type { ColorScheme } from '../color/scheme';

export interface ContextInit {
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  scheme: ColorScheme;
}

export function createRenderContext(init: ContextInit): RenderContext {
  const { rows, cols, cellW, cellH, scheme } = init;
  const size = rows * cols;
  const ctx: RenderContext = {
    rows, cols, cellW, cellH, scheme,
    palette: [' ', '.', ':', '*', '#'],
    curvField:   new Float32Array(size),
    satField:    new Float32Array(size).fill(1),
    layerMask:   new Int8Array(size),
    textDensity: new Uint8Array(size),
    rawFacePixels: new Uint8Array(size),
    sampleFace(col: number, row: number): number {
      return ctx.rawFacePixels[row * cols + col] ?? 0;
    },
    frame: { elapsed: 0, dt: 0, timePhase: 0 },
  };
  return ctx;
}
