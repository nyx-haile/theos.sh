import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer, RenderContext } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { backgroundWaveEffect } from './background-wave';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:30,g:60,b:90}, secondary:{r:10,g:10,b:10}, accent:{r:200,g:100,b:50} };

function captureRenderer() {
  const box: { frame: Array<{ layer: string; density: number; hue: number; value: number }> } = { frame: [] };
  const r: Renderer = {
    init(){},
    drawFrame(f, _c: RenderContext) {
      box.frame = [...f].map(c => ({ layer: c.layer, density: c.density, hue: c.hue, value: c.value }));
    },
    dispose(){},
  };
  return { r, box };
}

describe('background-wave', () => {
  it('sets layer=bg on every cell', () => {
    const cap = captureRenderer();
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: cap.r });
    app.on('buildFields', () => {
      const { curvField, satField } = app.context();
      curvField.fill(1.02); satField.fill(1.0);
    }, { priority: 999 });
    backgroundWaveEffect.register(app);
    app.boot();
    app.tickFrame(0);
    expect(cap.box.frame.length).toBe(4);
    for (const c of cap.box.frame) expect(c.layer).toBe('bg');
  });
});
