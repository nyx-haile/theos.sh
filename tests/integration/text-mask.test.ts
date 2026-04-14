/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';
import { textMaskEffect } from '../../src/effects/base/text-mask';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('text-mask', () => {
  it('populates rawFacePixels and layerMask face cells', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 25, cols: 80, cellW: 15, cellH: 15, renderer: nullRenderer });
    textMaskEffect.register(app);
    app.boot();
    const ctx = app.context();
    let maskCount = 0;
    for (let i = 0; i < ctx.layerMask.length; i++) if (ctx.layerMask[i] === 3) maskCount++;
    expect(maskCount).toBeGreaterThan(0);
  });

  it('computes textDensity for face cells', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 25, cols: 80, cellW: 15, cellH: 15, renderer: nullRenderer });
    textMaskEffect.register(app);
    app.boot();
    const ctx = app.context();
    let anyDensity = 0;
    for (let i = 0; i < ctx.textDensity.length; i++) anyDensity += ctx.textDensity[i]!;
    expect(anyDensity).toBeGreaterThan(0);
  });
});
