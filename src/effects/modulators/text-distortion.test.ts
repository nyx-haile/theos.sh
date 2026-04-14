import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { textDistortionEffect } from './text-distortion';
import { gate } from '../gates';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function findSeed(pred: (s: Uint8Array) => boolean): Uint8Array {
  for (let i = 0; i < 2000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
    if (pred(s)) return s;
  }
  throw new Error('no seed found');
}

describe('text-distortion', () => {
  it('dormant seed: sampleFace unchanged reads rawFacePixels directly', () => {
    const seed = findSeed(s => gate(s, 'textDistortion') >= 0.40);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    textDistortionEffect.register(app);
    app.boot();
    const ctx = app.context();
    ctx.rawFacePixels[0 * 4 + 2] = 200;
    expect(ctx.sampleFace(2, 0)).toBe(200);
  });

  it('active seed: sampleFace applies row-dependent horizontal shift, clamps to bounds', () => {
    const seed = findSeed(s => gate(s, 'textDistortion') < 0.40);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 8, cellW: 15, cellH: 15, renderer: nullRenderer });
    textDistortionEffect.register(app);
    app.boot();
    const ctx = app.context();
    for (let i = 0; i < ctx.rawFacePixels.length; i++) ctx.rawFacePixels[i] = 111;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) expect(ctx.sampleFace(col, row)).toBe(111);
  });
});
