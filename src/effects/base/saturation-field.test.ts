import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { saturationFieldEffect } from './saturation-field';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('saturation-field', () => {
  it('fills satField with values in [0.6, 1.0]', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(11), scheme, rows: 6, cols: 6, cellW: 15, cellH: 15, renderer: nullRenderer });
    saturationFieldEffect.register(app);
    app.boot();
    const f = app.context().satField;
    for (let i = 0; i < f.length; i++) {
      expect(f[i]!).toBeGreaterThanOrEqual(0.6);
      expect(f[i]!).toBeLessThanOrEqual(1.0);
    }
  });
});
