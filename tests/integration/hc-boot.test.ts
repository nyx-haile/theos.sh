import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { Applicator } from '../../src/applicator';
import { HIGH_CONTRAST_SCHEME } from '../../src/color/high-contrast';
import { registerAll } from '../../src/effects/registry';
import type { Renderer } from '../../src/renderers/types';

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  (globalThis as any).document = dom.window.document;
  (globalThis as any).window   = dom.window;
});

describe('hc boot configuration', () => {
  it('produces an Applicator with hc=true and the contrast scheme', () => {
    const seed = new Uint8Array(32); // all zeros
    const nullRenderer: Renderer = { init() {}, drawFrame() {}, dispose() {} };
    const app = new Applicator({
      seed, scheme: HIGH_CONTRAST_SCHEME,
      rows: 20, cols: 40, cellW: 15, cellH: 15,
      renderer: nullRenderer, hc: true,
    });
    registerAll(app);
    app.boot();
    expect(app.context().hc).toBe(true);
    expect(app.context().scheme).toBe(HIGH_CONTRAST_SCHEME);
    // With seed=0 and hc=true, no glitch burst emissions over 2s:
    let emissions = 0;
    app.on('glitch:burst', () => { emissions++; });
    for (let t = 0; t < 2000; t += 16) app.tickFrame(t);
    expect(emissions).toBe(0);
  });
});
