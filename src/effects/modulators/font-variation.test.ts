import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { fontVariationEffect } from './font-variation';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('font-variation', () => {
  it('always sets ctx.asciiFont to a non-empty monospace declaration', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(5), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    fontVariationEffect.register(app);
    app.boot();
    expect(app.context().asciiFont).toMatch(/\d+px monospace$/);
  });
});
