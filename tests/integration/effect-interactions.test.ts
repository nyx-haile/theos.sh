/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import { ASCIIRenderer } from '../../src/renderers/ascii';
import { registerAll } from '../../src/effects/registry';
import { generateColorScheme } from '../../src/color/scheme';
import { SEEDS } from '../fixtures/seeds';
import { gate, gateParam } from '../../src/effects/gates';

describe('effect interactions', () => {
  it('jitter burst: at least one frame contains charOverride cells', () => {
    const seed = SEEDS.find((s) => s.id === 'jitter-burst')!.bytes;
    const canvas = document.createElement('canvas');
    const app = new Applicator({
      seed,
      scheme: generateColorScheme(seed),
      rows: 15, cols: 40, cellW: 15, cellH: 15,
      renderer: new ASCIIRenderer(canvas.getContext('2d')!, 15, 15),
    });
    registerAll(app);
    app.boot();
    let overrides = 0;
    app.setRecorder({ record(_i, _e, cells) { for (const c of cells) if (c.charOverride) overrides++; } });
    for (let t = 0; t < 10_000; t += 50) app.tickFrame(t);
    expect(overrides).toBeGreaterThan(0);
  });

  it('manifold-genus geometric distribution fit (active seeds)', () => {
    let samples = 0; let sum = 0;
    for (let i = 1; i < 5000 && samples < 400; i++) {
      const s = new Uint8Array(32);
      new Uint32Array(s.buffer, 0, 8).set([i, i * 3, i * 5, i * 7, i * 11, i * 13, i * 17, i * 19]);
      if (gate(s, 'manifoldGenus') >= 0.3) continue;
      const u = gateParam(s, 'manifoldGenus', 'count');
      const p = 0.25 + gateParam(s, 'manifoldGenus', 'p') * 0.40;
      const g = Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - p)));
      sum += g; samples++;
    }
    const mean = sum / samples;
    expect(mean).toBeGreaterThan(1.5);
    expect(mean).toBeLessThan(4.0);
  });
});
