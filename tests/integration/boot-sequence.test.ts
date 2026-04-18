/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';
import { registerAll } from '../../src/effects/registry';

const scheme: ColorScheme = {
  background: { r: 0, g: 0, b: 0 },
  primary:    { r: 10, g: 20, b: 30 },
  secondary:  { r: 40, g: 50, b: 60 },
  accent:     { r: 70, g: 80, b: 90 },
};
const nullRenderer: Renderer = { init() {}, drawFrame() {}, dispose() {} };

describe('boot sequence', () => {
  it('fires lifecycle signals in spec order', () => {
    const app = new Applicator({
      seed: new Uint8Array(32).fill(3),
      scheme,
      rows: 4, cols: 4, cellW: 15, cellH: 15,
      renderer: nullRenderer,
    });
    const seen: string[] = [];
    for (const n of ['init', 'buildFields', 'fieldsReady', 'buildMask', 'maskReady', 'frameBegin', 'postRender', 'frameEnd'] as const) {
      app.on(n, () => seen.push(n));
    }
    registerAll(app);
    app.boot();
    app.tickFrame(16);
    expect(seen.slice(0, 5)).toEqual(['init', 'buildFields', 'fieldsReady', 'buildMask', 'maskReady']);
    const tail = seen.slice(5);
    expect(tail).toEqual(['frameBegin', 'postRender', 'frameEnd']);
  });
});
