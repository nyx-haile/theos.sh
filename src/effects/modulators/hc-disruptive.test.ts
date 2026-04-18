import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import { textDistortionEffect } from './text-distortion';
import { charsetVariantEffect } from './charset-variant';
import type { ColorScheme } from '../../color/scheme';
import type { Renderer, Frame, RenderContext } from '../../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = {
  init(_ctx: RenderContext) {},
  drawFrame(_f: Frame, _ctx: RenderContext) {},
  dispose() {},
};
const ASCII = [' ', '.', ':', '*', '#'];

describe('disruptive modulators respect hc flag', () => {
  it('text-distortion leaves sampleFace as the default identity sampler when hc=true', () => {
    const seed = new Uint8Array(32).fill(3);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    textDistortionEffect.register(app);
    const ctx = app.context();
    ctx.rawFacePixels.set([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]);
    app.boot();
    expect(ctx.sampleFace(2, 1)).toBe(7);
    expect(ctx.sampleFace(0, 3)).toBe(13);
  });

  it('charset-variant forces the default ASCII palette when hc=true', () => {
    const seed = new Uint8Array(32).fill(7);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    charsetVariantEffect.register(app);
    app.boot();
    expect(app.context().palette).toEqual(ASCII);
  });
});
