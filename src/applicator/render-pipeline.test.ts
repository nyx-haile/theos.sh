import { describe, it, expect } from 'vitest';
import { RenderPipeline } from './render-pipeline';
import type { RenderContext } from '../renderers/types';

function makeCtx(rows: number, cols: number): RenderContext {
  const size = rows * cols;
  return {
    rows, cols, cellW: 15, cellH: 15,
    scheme: { background: {r:0,g:0,b:0}, primary:{r:1,g:2,b:3}, secondary:{r:4,g:5,b:6}, accent:{r:7,g:8,b:9} },
    palette: [' ', '.', ':', '*', '#'],
    curvField: new Float32Array(size),
    satField:  new Float32Array(size).fill(1),
    layerMask: new Int8Array(size),
    textDensity: new Uint8Array(size),
    rawFacePixels: new Uint8Array(size),
    sampleFace(col, row) { return this.rawFacePixels[row * this.cols + col] ?? 0; },
    frame: { elapsed: 0, dt: 0, timePhase: 0 },
    hc: false,
  };
}

describe('RenderPipeline', () => {
  it('iterates exactly rows*cols times per frame', () => {
    const pipe = new RenderPipeline(3, 4);
    let n = 0;
    pipe.registerCellContributor('c', () => { n++; });
    const ctx = makeCtx(3, 4);
    pipe.produceFrame(ctx);
    expect(n).toBe(12);
  });

  it('applies contributors in priority order (last-writer-wins)', () => {
    const pipe = new RenderPipeline(2, 2);
    pipe.registerCellContributor('hi', c => { c.density = 0.9; c.hue = 99; }, { priority: 100 });
    pipe.registerCellContributor('lo', c => { c.density = 0.1; c.hue = 10; }, { priority: 0 });
    const ctx = makeCtx(2, 2);
    const frame = pipe.produceFrame(ctx);
    for (const c of frame) { expect(c.density).toBe(0.9); expect(c.hue).toBe(99); }
  });

  it('no-op contributor does not perturb state', () => {
    const pipe = new RenderPipeline(1, 1);
    pipe.registerCellContributor('set', c => { c.density = 0.5; }, { priority: 0 });
    pipe.registerCellContributor('skip', () => {}, { priority: 10 });
    const ctx = makeCtx(1, 1);
    const frame = pipe.produceFrame(ctx);
    expect(frame[0]!.density).toBe(0.5);
  });

  it('unregister removes a contributor', () => {
    const pipe = new RenderPipeline(1, 1);
    const reg = pipe.registerCellContributor('x', c => { c.density = 1; });
    pipe.unregister(reg);
    const ctx = makeCtx(1, 1);
    const frame = pipe.produceFrame(ctx);
    expect(frame[0]!.density).toBe(0);
  });

  it('resets cell state between frames', () => {
    const pipe = new RenderPipeline(1, 1);
    let first = true;
    pipe.registerCellContributor('once', c => { if (first) { c.density = 0.7; first = false; } });
    const ctx = makeCtx(1, 1);
    pipe.produceFrame(ctx);
    const frame2 = pipe.produceFrame(ctx);
    expect(frame2[0]!.density).toBe(0);
  });

  it('reuses cell state objects across frames (no reallocation)', () => {
    const pipe = new RenderPipeline(2, 2);
    pipe.registerCellContributor('x', () => {});
    const ctx = makeCtx(2, 2);
    const f1 = pipe.produceFrame(ctx);
    const snapshots = [f1[0], f1[1], f1[2], f1[3]];
    const f2 = pipe.produceFrame(ctx);
    for (let i = 0; i < 4; i++) expect(f2[i]).toBe(snapshots[i]);
  });
});
