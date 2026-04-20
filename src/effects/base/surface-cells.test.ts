import { describe, it, expect } from 'vitest';
import { createSurfaceCellsEffect, type FrameRef } from './surface-cells';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ShadedCell } from '../../surface-game/types';
import { generateColorScheme } from '../../color/scheme';

function makeCanvas(): Renderer {
  return { init() {}, drawFrame() {}, dispose() {} };
}

function makeShaded(kind: ShadedCell['hitKind'], glyph: string, luminance: number): ShadedCell {
  return { glyph, luminance, hitKind: kind, depth: 0.5 };
}

describe('surface-cells base contributor', () => {
  it('passes glyph through as charOverride for terrain cells', () => {
    const seed = new Uint8Array(32).fill(7);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 2, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('terrain', '#', 0.8), makeShaded('sky', ' ', 0)], cellsWide: 2, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const pipeline = (app as any).pipeline;
    const cell0 = pipeline.frame[0];
    const cell1 = pipeline.frame[1];
    expect(cell0.charOverride).toBe('#');
    expect(cell0.layer).toBe('face');
    // Sky cells are left untouched so background-wave's contribution survives.
    expect(cell1.charOverride).toBeUndefined();
    expect(cell1.layer).toBe('bg');
  });

  it('marks artifact hits as shadow layer with scheme.secondary-tinted HSV', () => {
    const seed = new Uint8Array(32).fill(3);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('artifact', '*', 0.9)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const cell = (app as any).pipeline.frame[0];
    expect(cell.layer).toBe('shadow');
    expect(cell.charOverride).toBe('*');
    expect(cell.value).toBeGreaterThan(0);
  });

  it('routes title face hits through face layer without charOverride (palette picks glyph)', () => {
    const seed = new Uint8Array(32).fill(5);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    // luminance carries raw-density/9 in the new contract.
    const frameRef: FrameRef = { cells: [makeShaded('title', ' ', 4 / 9)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const cell = (app as any).pipeline.frame[0];
    expect(cell.layer).toBe('face');
    expect(cell.charOverride).toBeUndefined();
    expect(cell.density).toBeCloseTo(4 / 4, 5);
    expect(cell.value).toBeGreaterThan(0);
  });

  it('routes title-shadow hits through shadow layer with density 0.35', () => {
    const seed = new Uint8Array(32).fill(13);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('title-shadow', ' ', 0.35)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const cell = (app as any).pipeline.frame[0];
    expect(cell.layer).toBe('shadow');
    expect(cell.charOverride).toBeUndefined();
    expect(cell.density).toBeCloseTo(0.35, 5);
  });

  it('title saturation scales with saturation-field multiplier', () => {
    const seed = new Uint8Array(32).fill(11);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('title', ' ', 4 / 9)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    // Prime saturation field with a known multiplier before boot fires the contributor.
    app.on('fieldsReady', () => { app.context().satField[0] = 0.25; }, { priority: 999 });
    app.boot();
    app.tickFrame(16);
    const low = (app as any).pipeline.frame[0].saturation;
    app.context().satField[0] = 1.0;
    app.tickFrame(32);
    const high = (app as any).pipeline.frame[0].saturation;
    expect(high).toBeGreaterThan(low);
  });

  it('density equals luminance for terrain cells', () => {
    const seed = new Uint8Array(32).fill(1);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('terrain', '.', 0.4)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const cell = (app as any).pipeline.frame[0];
    expect(cell.density).toBeCloseTo(0.4, 5);
  });
});
