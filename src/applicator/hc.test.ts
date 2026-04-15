import { describe, it, expect } from 'vitest';
import { Applicator } from './index';
import type { ColorScheme } from '../color/scheme';
import type { Renderer } from '../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init() {}, drawFrame() {}, dispose() {} };

describe('Applicator hc flag', () => {
  it('defaults to false and surfaces via context', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: nullRenderer });
    expect(app.context().hc).toBe(false);
  });
  it('propagates true when set', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    expect(app.context().hc).toBe(true);
  });
});
