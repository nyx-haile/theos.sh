import { Applicator } from '../../../src/applicator';
import { ASCIIRenderer } from '../../../src/renderers/ascii';
import { registerAll } from '../../../src/effects/registry';
import { generateColorScheme } from '../../../src/color/scheme';
import type { Frame } from '../../../src/renderers/types';

export interface Recorded { frameIndex: number; elapsed: number; hash: string; }

function hashFrame(f: Frame): string {
  let h = 0x811c9dc5;
  for (const c of f) {
    const parts = [
      c.layer.charCodeAt(0),
      Math.round(c.density * 10_000),
      Math.round(c.hue * 100),
      Math.round(c.saturation * 10_000),
      Math.round(c.value * 10_000),
      Math.round(c.dx * 10_000),
      Math.round(c.dy * 10_000),
    ];
    for (const p of parts) { h ^= p >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}

export function bootAndTick(seed: Uint8Array, rows: number, cols: number, ticksMs: number[]): Recorded[] {
  const canvas = document.createElement('canvas');
  canvas.width = cols * 15; canvas.height = rows * 15;
  const ctx2d = canvas.getContext('2d')!;
  const scheme = generateColorScheme(seed);
  const renderer = new ASCIIRenderer(ctx2d, 15, 15);
  const app = new Applicator({ seed, scheme, rows, cols, cellW: 15, cellH: 15, renderer });
  registerAll(app);
  app.boot();
  const out: Recorded[] = [];
  app.setRecorder({ record(frameIndex, elapsed, cells) { out.push({ frameIndex, elapsed, hash: hashFrame(cells) }); } });
  for (const t of ticksMs) app.tickFrame(t);
  app.dispose();
  return out;
}
