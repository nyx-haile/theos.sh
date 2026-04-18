/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';
import { textMaskEffect } from '../../src/effects/base/text-mask';
import { shadow3dEffect } from '../../src/effects/modulators/shadow-3d';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('shadow-3d', () => {
  it('extrudes shadow cells adjacent to face cells for at least one seed', () => {
    let anyShadows = false;
    for (let i = 1; i < 20 && !anyShadows; i++) {
      const seed = new Uint8Array(32); new Uint32Array(seed.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
      const app = new Applicator({ seed, scheme, rows: 25, cols: 80, cellW: 15, cellH: 15, renderer: nullRenderer });
      textMaskEffect.register(app);
      shadow3dEffect.register(app);
      app.boot();
      const lm = app.context().layerMask;
      let shadows = 0; for (let j = 0; j < lm.length; j++) if (lm[j] === 1) shadows++;
      if (shadows > 0) anyShadows = true;
    }
    expect(anyShadows).toBe(true);
  });
});
