import { describe, it, expect, beforeEach } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { backgroundWaveEffect } from './background-wave';
import { revealEffect, __resetReveal } from './reveal';
import { textCellsEffect } from './text-cells';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:30,g:60,b:90}, secondary:{r:180,g:100,b:40}, accent:{r:200,g:100,b:50} };

function captureRenderer() {
  const box: { frame: Array<{ layer: string; row: number; col: number }> } = { frame: [] };
  const r: Renderer = {
    init(){},
    drawFrame(f) { box.frame = [...f].map(c => ({ layer: c.layer, row: c.row, col: c.col })); },
    dispose(){},
  };
  return { r, box };
}

describe('text-cells', () => {
  beforeEach(() => __resetReveal());

  it('sets layer=face on face cells once revealed', () => {
    const cap = captureRenderer();
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: cap.r });
    app.on('buildMask', () => {
      const lm = app.context().layerMask;
      lm[0] = 3; lm[1] = 1;
    }, { priority: 999 });
    revealEffect.register(app);
    backgroundWaveEffect.register(app);
    textCellsEffect.register(app);
    app.boot();
    app.tickFrame(10_000);
    const face = cap.box.frame.find(c => c.row === 0 && c.col === 0);
    const shadow = cap.box.frame.find(c => c.row === 0 && c.col === 1);
    expect(face!.layer).toBe('face');
    expect(shadow!.layer).toBe('shadow');
  });
});
