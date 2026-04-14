import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { charsetVariantEffect } from './charset-variant';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('charset-variant', () => {
  it('always replaces palette (always active) on init', () => {
    const seed = new Uint8Array(32).fill(3);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    charsetVariantEffect.register(app);
    app.boot();
    const palette = app.context().palette;
    expect(palette.length).toBe(5);
  });

  it('different seeds may select different palettes', () => {
    const a = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows:1, cols:1, cellW:15, cellH:15, renderer: nullRenderer });
    const b = new Applicator({ seed: new Uint8Array(32).fill(9), scheme, rows:1, cols:1, cellW:15, cellH:15, renderer: nullRenderer });
    charsetVariantEffect.register(a); charsetVariantEffect.register(b);
    a.boot(); b.boot();
    expect(a.context().palette.length).toBe(5);
    expect(b.context().palette.length).toBe(5);
  });
});
