/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { wireInputMapper } from '../../src/input/input-mapper';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('wireInputMapper', () => {
  it('emits keyPress on keydown and disposer removes the listener', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    app.boot();
    const received: string[] = [];
    app.on('keyPress', ({ key }) => received.push(key));
    const dispose = wireInputMapper(app);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(received).toEqual(['a']);
    dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(received).toEqual(['a']);
  });
});
