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
    expect(cell1.charOverride).toBe(' ');
    expect(cell1.layer).toBe('void');
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
