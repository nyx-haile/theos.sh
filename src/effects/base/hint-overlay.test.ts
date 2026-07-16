import { describe, it, expect } from 'vitest';
import { makeHintOverlayEffect } from './hint-overlay';
import { createVisibilityStore } from '../../game/visibility-store';
import type { CellState, RenderContext } from '../../renderers/types';

function mockCtx(cols: number, rows: number): RenderContext {
  return {
    rows, cols, cellW: 10, cellH: 10,
    scheme: {
      primary:   { r: 0, g: 0, b: 0 },
      accent:    { r: 255, g: 255, b: 255 },
      background:{ r: 10, g: 10, b: 10 },
    } as unknown as RenderContext['scheme'],
    palette: [],
    curvField: new Float32Array(cols * rows),
    satField: new Float32Array(cols * rows),
    layerMask: new Int8Array(cols * rows),
    textDensity: new Uint8Array(cols * rows),
    rawFacePixels: new Uint8Array(cols * rows),
    sampleFace: () => 0,
    frame: { elapsed: 0, dt: 16, timePhase: 0 },
    hc: false,
    viewportCol: 0,
    viewportRow: 0,
  };
}

const mkCell = (row: number, col: number): CellState => ({
  row, col, layer: 'bg', density: 0, hue: 0, saturation: 0, value: 0, dx: 0, dy: 0,
});

describe('hint-overlay', () => {
  it('boosts density and shifts hue only at the hint cell', () => {
    const store = createVisibilityStore();
    store.replace([{
      handle: 'h1',
      relativeOffset: { dCol: 2, dRow: 1 },
      hintCell: { dCol: 0, dRow: 0, accentHue: 0.7, densityBoost: 0.4 },
    }], { centerCol: 10, centerRow: 10 });

    const effect = makeHintOverlayEffect(() => store, () => ({ centerCol: 10, centerRow: 10 }));
    const ctx = mockCtx(40, 40);
    const hit = mkCell(11, 12);
    const miss = mkCell(11, 13);

    effect.contribute(hit, ctx);
    effect.contribute(miss, ctx);

    expect(hit.density).toBeGreaterThan(0);
    expect(hit.hue).toBeCloseTo(0.7, 5);
    expect(miss.density).toBe(0);
  });

  it('does nothing when the store is empty', () => {
    const store = createVisibilityStore();
    const effect = makeHintOverlayEffect(() => store, () => ({ centerCol: 0, centerRow: 0 }));
    const cell = mkCell(0, 0);
    effect.contribute(cell, mockCtx(10, 10));
    expect(cell.density).toBe(0);
  });
});
