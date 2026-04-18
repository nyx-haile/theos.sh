import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { manifoldGenusEffect } from './manifold-genus';
import { gate } from '../gates';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:80,g:160,b:240}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function activeSeed(): Uint8Array {
  for (let i = 0; i < 2000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*2,i*3,i*5,i*7,i*11,i*13,i*17]);
    if (gate(s, 'manifoldGenus') < 0.30) return s;
  }
  throw new Error('no active seed found');
}

function dormantSeed(): Uint8Array {
  for (let i = 0; i < 2000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*2,i*3,i*5,i*7,i*11,i*13,i*17]);
    if (gate(s, 'manifoldGenus') >= 0.30) return s;
  }
  throw new Error('no dormant seed found');
}

describe('manifold-genus', () => {
  it('is dormant when gate >= 0.30 — no mask mutation, no contributor run effect', () => {
    const seed = dormantSeed();
    const app = new Applicator({ seed, scheme, rows: 10, cols: 10, cellW: 15, cellH: 15, renderer: nullRenderer });
    manifoldGenusEffect.register(app);
    app.boot();
    const lm = app.context().layerMask;
    for (let i = 0; i < lm.length; i++) expect(lm[i]).toBe(0);
  });

  it('marks some cells as void (-1) when active', () => {
    const seed = activeSeed();
    const app = new Applicator({ seed, scheme, rows: 20, cols: 20, cellW: 15, cellH: 15, renderer: nullRenderer });
    manifoldGenusEffect.register(app);
    app.boot();
    const lm = app.context().layerMask;
    let holes = 0; for (let i = 0; i < lm.length; i++) if (lm[i] === -1) holes++;
    expect(holes).toBeGreaterThan(0);
  });
});
