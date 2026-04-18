import { describe, it, expect } from 'vitest';
import { Applicator } from './index';
import type { ColorScheme } from '../color/scheme';
import type { Renderer } from '../renderers/types';

const scheme: ColorScheme = {
  background: {r:0,g:0,b:0}, primary:{r:10,g:20,b:30},
  secondary:{r:40,g:50,b:60}, accent:{r:70,g:80,b:90},
};

const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('Applicator', () => {
  it('fires lifecycle signals in order on boot()', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: nullRenderer });
    const seen: string[] = [];
    for (const n of ['init','buildFields','fieldsReady','buildMask','maskReady'] as const) {
      app.on(n, () => seen.push(n));
    }
    app.boot();
    expect(seen).toEqual(['init','buildFields','fieldsReady','buildMask','maskReady']);
  });

  it('fires frame signals on tickFrame', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    app.boot();
    const seen: string[] = [];
    app.on('frameBegin', () => seen.push('begin'));
    app.on('postRender', () => seen.push('post'));
    app.on('frameEnd',   () => seen.push('end'));
    app.tickFrame(16);
    expect(seen).toEqual(['begin','post','end']);
  });

  it('calls renderer.drawFrame once per tick', () => {
    let n = 0;
    const r: Renderer = { init(){}, drawFrame(){ n++; }, dispose(){} };
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: r });
    app.boot();
    app.tickFrame(16); app.tickFrame(32);
    expect(n).toBe(2);
  });

  it('recorder receives finalized cells before renderer draw', () => {
    const calls: Array<{ idx: number; elapsed: number }> = [];
    let drawAfter = 0;
    const r: Renderer = {
      init(){}, drawFrame(){ drawAfter = calls.length; }, dispose(){}
    };
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows:1, cols:1, cellW:15, cellH:15, renderer: r });
    app.boot();
    app.setRecorder({ record(idx, elapsed) { calls.push({ idx, elapsed }); } });
    app.tickFrame(10);
    expect(calls.length).toBe(1);
    expect(drawAfter).toBe(1);
  });

  it('__inspect returns subscription counts and contributors', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    app.on('init', () => {});
    const ins = app.__inspect();
    expect(ins.subscriptions['init']).toBe(1);
    expect(ins.contributors).toEqual([]);
  });
});
