import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { jitterEffect } from './jitter';
import { gate } from '../gates';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:200,g:100,b:50}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function find(pred: (s: Uint8Array) => boolean): Uint8Array {
  for (let i = 0; i < 3000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
    if (pred(s)) return s;
  }
  throw new Error('no seed');
}

describe('jitter', () => {
  it('dormant both subsources: registers cell contributor but no displacement applied', () => {
    const seed = find(s => gate(s, 'jitter') >= 0.35 && gate(s, 'cellGlitch') >= 0.50);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    jitterEffect.register(app);
    app.boot();
    const inspect = app.__inspect();
    expect(inspect.contributors.find(c => c.name === 'jitter')).toBeDefined();
  });

  it('base-jitter active: produces non-zero |dx|+|dy| on at least some cells', () => {
    const seed = find(s => gate(s, 'jitter') < 0.35);
    const collected: Array<{ dx: number; dy: number }> = [];
    const r: Renderer = { init(){}, drawFrame(f){ for (const c of f) collected.push({ dx: c.dx, dy: c.dy }); }, dispose(){} };
    const app = new Applicator({ seed, scheme, rows: 8, cols: 8, cellW: 15, cellH: 15, renderer: r });
    jitterEffect.register(app);
    app.boot(); app.tickFrame(16);
    const nonzero = collected.filter(c => Math.abs(c.dx) + Math.abs(c.dy) > 0);
    expect(nonzero.length).toBeGreaterThan(0);
  });

  it('burst active: emits glitch:burst when a burst fires', () => {
    const seed = find(s => gate(s, 'cellGlitch') < 0.50);
    const app = new Applicator({ seed, scheme, rows: 8, cols: 8, cellW: 15, cellH: 15, renderer: nullRenderer });
    jitterEffect.register(app);
    let burstCount = 0;
    app.on('glitch:burst', () => burstCount++);
    app.boot();
    for (let t = 0; t < 10_000; t += 50) app.tickFrame(t);
    expect(burstCount).toBeGreaterThan(0);
  });
});
