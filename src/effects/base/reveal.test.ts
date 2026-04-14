import { describe, it, expect, beforeEach } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { revealEffect, isRevealed, __resetReveal } from './reveal';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function primeMask(ctx: { layerMask: Int8Array }, cells: number[]) {
  for (const i of cells) ctx.layerMask[i] = 3;
}

describe('reveal', () => {
  beforeEach(() => __resetReveal());

  it('isRevealed returns false before any tick', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 4, cols: 4, cellW:15, cellH:15, renderer: nullRenderer });
    revealEffect.register(app);
    app.on('buildMask', () => primeMask(app.context(), [0, 1, 2]), { priority: 999 });
    app.boot();
    expect(isRevealed(0)).toBe(false);
  });

  it('reveals all cells by REVEAL_TOTAL_MS', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW:15, cellH:15, renderer: nullRenderer });
    revealEffect.register(app);
    app.on('buildMask', () => primeMask(app.context(), [0, 1, 2, 3]), { priority: 999 });
    app.boot();
    app.tickFrame(6000);
    let count = 0; for (let i = 0; i < 4; i++) if (isRevealed(i)) count++;
    expect(count).toBe(4);
  });

  it('reveal order is deterministic per seed', () => {
    const run = () => {
      __resetReveal();
      const app = new Applicator({ seed: new Uint8Array(32).fill(9), scheme, rows: 4, cols: 4, cellW:15, cellH:15, renderer: nullRenderer });
      revealEffect.register(app);
      app.on('buildMask', () => primeMask(app.context(), [0,1,2,3,4,5,6,7]), { priority: 999 });
      app.boot();
      app.tickFrame(100);
      const out: number[] = []; for (let i = 0; i < 16; i++) if (isRevealed(i)) out.push(i);
      return out;
    };
    expect(run()).toEqual(run());
  });
});
