import { Applicator } from '../../../src/applicator';
import { ASCIIRenderer } from '../../../src/renderers/ascii';
import { registerAll } from '../../../src/effects/registry';
import { generateColorScheme } from '../../../src/color/scheme';
import type { Frame } from '../../../src/renderers/types';

export interface Recorded {
  frameIndex: number;
  elapsed: number;
  /** Full-fidelity cell hash: geometry AND palette-derived HSV. */
  hash: string;
  /**
   * Palette-independent hash of `ctx.rawFacePixels` — the downsampled alpha
   * raster of the title mask. Depends only on mask geometry (canvas layout,
   * font metrics, font-weight gate), never on the colour scheme, so a palette
   * change cannot move it. See docs/testing.md.
   */
  maskHash: string;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv(h: number, p: number): number {
  h ^= p >>> 0;
  return Math.imul(h, FNV_PRIME) >>> 0;
}

/** FNV-1a over a raw byte buffer. Exported so tests can derive reference hashes. */
export function hashBytes(bytes: Uint8Array): string {
  let h = FNV_OFFSET;
  for (const b of bytes) h = fnv(h, b);
  return h.toString(16).padStart(8, '0');
}

/** Hash of an all-zero mask of the given cell count — i.e. "the font drew nothing". */
export function blankMaskHash(rows: number, cols: number): string {
  return hashBytes(new Uint8Array(rows * cols));
}

function hashFrame(f: Frame): string {
  let h = FNV_OFFSET;
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
    for (const p of parts) h = fnv(h, p);
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
  const ctx = app.context();
  const out: Recorded[] = [];
  // maskHash is recomputed per frame on purpose: rawFacePixels is populated once
  // during boot's 'buildMask' phase, so any per-frame movement is itself a defect.
  app.setRecorder({
    record(frameIndex, elapsed, cells) {
      out.push({ frameIndex, elapsed, hash: hashFrame(cells), maskHash: hashBytes(ctx.rawFacePixels) });
    },
  });
  for (const t of ticksMs) app.tickFrame(t);
  app.dispose();
  return out;
}
