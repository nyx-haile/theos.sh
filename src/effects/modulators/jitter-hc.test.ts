import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import { jitterEffect } from './jitter';
import type { ColorScheme } from '../../color/scheme';
import type { Renderer, Frame, RenderContext } from '../../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = {
  init(_ctx: RenderContext) {},
  drawFrame(_f: Frame, _ctx: RenderContext) {},
  dispose() {},
};

describe('jitter respects hc flag', () => {
  it('produces no glitch events when hc=true, regardless of seed', () => {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = i + 1;
    let emissions = 0;
    const app = new Applicator({ seed, scheme, rows: 20, cols: 40, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    app.on('glitch:burst', () => { emissions++; });
    jitterEffect.register(app);
    app.boot();
    for (let t = 0; t < 2000; t += 16) app.tickFrame(t);
    expect(emissions).toBe(0);
  });
});
