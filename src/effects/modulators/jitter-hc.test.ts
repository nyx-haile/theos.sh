import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import { jitterEffect } from './jitter';
import { gate } from '../gates';
import type { ColorScheme } from '../../color/scheme';
import type { Renderer, Frame, RenderContext } from '../../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = {
  init(_ctx: RenderContext) {},
  drawFrame(_f: Frame, _ctx: RenderContext) {},
  dispose() {},
};

function find(pred: (s: Uint8Array) => boolean): Uint8Array {
  for (let i = 0; i < 3000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
    if (pred(s)) return s;
  }
  throw new Error('no seed');
}

// Find a seed that activates jitter burst effect (cellGlitch < 0.50)
const ACTIVATING_SEED = find(s => gate(s, 'cellGlitch') < 0.50);

describe('jitter respects hc flag', () => {
  it('seed activates jitter bursts when hc=false (control)', () => {
    let emissions = 0;
    const app = new Applicator({ seed: ACTIVATING_SEED, scheme, rows: 20, cols: 40, cellW: 15, cellH: 15, renderer: nullRenderer, hc: false });
    app.on('glitch:burst', () => { emissions++; });
    jitterEffect.register(app);
    app.boot();
    for (let t = 0; t < 2000; t += 16) app.tickFrame(t);
    expect(emissions).toBeGreaterThan(0);
  });

  it('produces no glitch events when hc=true, regardless of seed', () => {
    let emissions = 0;
    const app = new Applicator({ seed: ACTIVATING_SEED, scheme, rows: 20, cols: 40, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    app.on('glitch:burst', () => { emissions++; });
    jitterEffect.register(app);
    app.boot();
    for (let t = 0; t < 2000; t += 16) app.tickFrame(t);
    expect(emissions).toBe(0);
  });
});
