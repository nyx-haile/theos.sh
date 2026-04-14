import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { curvatureFieldEffect } from './curvature-field';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('curvature-field', () => {
  it('fills curvField with values centered near 1', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(2), scheme, rows: 8, cols: 8, cellW: 15, cellH: 15, renderer: nullRenderer });
    curvatureFieldEffect.register(app);
    app.boot();
    const f = app.context().curvField;
    let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i]!;
    const mean = sum / f.length;
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(1.2);
  });

  it('is deterministic per seed', () => {
    const seed = new Uint8Array(32).fill(4);
    const a = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    const b = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    curvatureFieldEffect.register(a); curvatureFieldEffect.register(b);
    a.boot(); b.boot();
    expect(Array.from(a.context().curvField)).toEqual(Array.from(b.context().curvField));
  });
});
