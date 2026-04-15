import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';
import { effectPrng } from '../prng';

declare module '../../signals/catalog' {
  interface SignalMap {
    'glitch:burst': { rowStart: number; rowEnd: number; intensity: number };
  }
}

type GlitchKind =
  | 'rect' | 'vertical' | 'horizontal' | 'interlace' | 'skew' | 'block'
  | 'chroma' | 'mirror' | 'displaced-row';

interface GlitchEvent {
  kind:        GlitchKind;
  startMs:     number;
  durationMs:  number;
  rowStart:    number;
  rowEnd:      number;
  colStart:    number;
  colEnd:      number;
  shiftDx:     number;
  shiftDy:     number;
  slope:       number;
  gibberish:   boolean;
  chromatic:   boolean;
}

const GIBBERISH = '█▓▒░#%$&@?!*+=<>/\\|[]{}()~^`;:\'"';
const EVENT_HORIZON_MS = 60_000;
const SLOT_MS          = 220;
const SLOT_HIT_PROB    = 0.30;
const GEOM_P           = 0.9;
const CHROMATIC_PROB   = 0.55;

function brightenScheme(c: { r: number; g: number; b: number }, scale: number): string {
  return `rgb(${Math.min(255, Math.round(c.r * scale))},${Math.min(255, Math.round(c.g * scale))},${Math.min(255, Math.round(c.b * scale))})`;
}

const KIND_WEIGHTS: Array<[GlitchKind, number]> = [
  ['rect',          0.15],
  ['vertical',      0.10],
  ['horizontal',    0.12],
  ['interlace',     0.12],
  ['skew',          0.12],
  ['block',         0.12],
  ['chroma',        0.12],
  ['mirror',        0.09],
  ['displaced-row', 0.06],
];

function pickKind(u: number): GlitchKind {
  let acc = 0;
  for (const [k, w] of KIND_WEIGHTS) { acc += w; if (u < acc) return k; }
  return 'rect';
}

export const jitterEffect: Effect = {
  name: 'jitter',
  register(app) {
    let baseActive = false;
    let baseAmp = 0;
    let burstActive = false;
    const events: GlitchEvent[] = [];
    let shiftDx: Int16Array | null = null;
    let shiftDy: Int16Array | null = null;
    let gibberishMask: Uint8Array | null = null;
    let chromaMask: Int8Array | null = null;
    let colorGlitch = 'rgb(255,255,255)';
    let chromaColorA = 'rgb(255,255,255)';
    let chromaColorB = 'rgb(255,255,255)';

    app.on('maskReady', () => {
      const seed = app.manifoldState().seed;
      const ctx = app.context();
      const { rows, cols } = ctx;
      const { hc } = ctx;
      baseActive  = !hc && gate(seed, 'jitter') < 0.35;
      baseAmp     = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2;
      burstActive = !hc && gate(seed, 'cellGlitch') < 0.50;
      shiftDx       = new Int16Array(rows * cols);
      shiftDy       = new Int16Array(rows * cols);
      gibberishMask = new Uint8Array(rows * cols);
      chromaMask    = new Int8Array(rows * cols);
      events.length = 0;
      if (burstActive) {
        const prng = effectPrng(seed, 'jitter:events');
        for (let t = 0; t < EVENT_HORIZON_MS; t += SLOT_MS) {
          if (prng.nextFloat() > SLOT_HIT_PROB) continue;
          const u = prng.nextFloat();
          const count = Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - GEOM_P)));
          for (let k = 0; k < count; k++) {
            const kind = pickKind(prng.nextFloat());
            let rowStart = Math.floor(prng.nextFloat() * rows);
            let rowSpan  = 1 + Math.floor(prng.nextFloat() * 5);
            let colStart = Math.floor(prng.nextFloat() * cols);
            let colSpan  = 3 + Math.floor(prng.nextFloat() * 15);
            let shiftDx  = Math.round((prng.nextFloat() - 0.5) * 14);
            let shiftDy  = Math.round((prng.nextFloat() - 0.5) * 4);
            let slope    = 0;
            let gibberish = prng.nextFloat() < 0.55;

            switch (kind) {
              case 'vertical':
                rowStart = 0; rowSpan = rows;
                colSpan = 1 + Math.floor(prng.nextFloat() * 4);
                break;
              case 'horizontal':
                colStart = 0; colSpan = cols;
                rowSpan = 1 + Math.floor(prng.nextFloat() * 3);
                shiftDy = 0;
                break;
              case 'interlace':
                rowSpan = 3 + Math.floor(prng.nextFloat() * 6);
                colSpan = 5 + Math.floor(prng.nextFloat() * 20);
                shiftDx = Math.max(2, Math.round(Math.abs(shiftDx)));
                shiftDy = 0;
                break;
              case 'skew':
                rowSpan = 3 + Math.floor(prng.nextFloat() * 8);
                colSpan = 5 + Math.floor(prng.nextFloat() * 20);
                slope = (prng.nextFloat() < 0.5 ? -1 : 1) * (1 + prng.nextFloat() * 2);
                shiftDx = Math.round((prng.nextFloat() - 0.5) * 4);
                shiftDy = 0;
                break;
              case 'block':
                rowSpan = 2 + Math.floor(prng.nextFloat() * 5);
                colSpan = 4 + Math.floor(prng.nextFloat() * 12);
                shiftDx = 0; shiftDy = 0;
                gibberish = true;
                break;
              case 'chroma':
                rowSpan = 3 + Math.floor(prng.nextFloat() * 6);
                colSpan = 6 + Math.floor(prng.nextFloat() * 18);
                shiftDx = 3 + Math.floor(prng.nextFloat() * 6);
                shiftDy = 0;
                gibberish = false;
                break;
              case 'mirror':
                rowSpan = 3 + Math.floor(prng.nextFloat() * 8);
                colSpan = 6 + Math.floor(prng.nextFloat() * 20);
                shiftDx = 0; shiftDy = 0;
                gibberish = false;
                break;
              case 'displaced-row':
                rowSpan = 1 + Math.floor(prng.nextFloat() * 2);
                colSpan = 10 + Math.floor(prng.nextFloat() * 30);
                shiftDx = 0;
                shiftDy = (prng.nextFloat() < 0.5 ? -1 : 1) * (2 + Math.floor(prng.nextFloat() * 4));
                gibberish = prng.nextFloat() < 0.3;
                break;
              case 'rect':
              default:
                break;
            }

            const chromatic = kind !== 'chroma' && !gibberish && prng.nextFloat() < CHROMATIC_PROB;
            events.push({
              kind,
              startMs:    t + prng.nextFloat() * SLOT_MS,
              durationMs: 40 + prng.nextFloat() * 80,
              rowStart,
              rowEnd:     Math.min(rows - 1, rowStart + rowSpan - 1),
              colStart,
              colEnd:     Math.min(cols - 1, colStart + colSpan - 1),
              shiftDx,
              shiftDy,
              slope,
              gibberish,
              chromatic,
            });
          }
        }
      }
      colorGlitch  = brightenScheme(ctx.scheme.secondary, 2.5);
      chromaColorA = brightenScheme(ctx.scheme.primary,    2.2);
      chromaColorB = brightenScheme(ctx.scheme.accent,     2.2);
    }, { priority: 200 });

    app.on('frameBegin', ({ elapsed }, busCtx) => {
      if (!shiftDx || !shiftDy || !gibberishMask || !chromaMask) return;
      shiftDx.fill(0); shiftDy.fill(0); gibberishMask.fill(0); chromaMask.fill(0);
      if (!burstActive) return;
      const cols = app.context().cols;
      for (const ev of events) {
        if (elapsed < ev.startMs || elapsed >= ev.startMs + ev.durationMs) continue;
        for (let r = ev.rowStart; r <= ev.rowEnd; r++) {
          const rowBase = r * cols;
          let rowDx = ev.shiftDx;
          if      (ev.kind === 'interlace') rowDx = (r & 1) === 0 ? ev.shiftDx : -ev.shiftDx;
          else if (ev.kind === 'skew')      rowDx = ev.shiftDx + Math.round((r - ev.rowStart) * ev.slope);
          for (let c = ev.colStart; c <= ev.colEnd; c++) {
            const idx = rowBase + c;
            if (ev.kind === 'mirror') {
              shiftDx[idx] = ev.colStart + ev.colEnd - 2 * c;
              shiftDy[idx] = 0;
            } else if (ev.kind === 'chroma') {
              const sign = ((c - ev.colStart) & 1) === 0 ? 1 : -1;
              shiftDx[idx] = sign * ev.shiftDx;
              shiftDy[idx] = 0;
              chromaMask[idx] = sign;
            } else {
              shiftDx[idx] = rowDx;
              shiftDy[idx] = ev.shiftDy;
            }
            if (ev.chromatic && ev.kind !== 'mirror' && ev.kind !== 'chroma') {
              chromaMask[idx] = ((c - ev.colStart) & 1) === 0 ? 1 : -1;
            }
            if (ev.gibberish) gibberishMask[idx] = 1;
          }
        }
        busCtx.emit('glitch:burst', { rowStart: ev.rowStart, rowEnd: ev.rowEnd, intensity: 1 });
      }
    }, { priority: 100 });

    app.registerCellContributor('jitter', (cell, rctx) => {
      if (baseActive) {
        const idx = cell.row * rctx.cols + cell.col;
        const n1 = ((idx * 2654435761) >>> 0) / 0xffffffff - 0.5;
        const n2 = (((idx + 991) * 40503) >>> 0) / 0xffffffff - 0.5;
        cell.dx += n1 * baseAmp * 2;
        cell.dy += n2 * baseAmp * 2;
      }
      if (shiftDx && shiftDy && gibberishMask && chromaMask) {
        const idx = cell.row * rctx.cols + cell.col;
        const dx = shiftDx[idx]!, dy = shiftDy[idx]!;
        const gib = gibberishMask[idx] === 1;
        const chroma = chromaMask[idx]!;
        if (dx !== 0 || dy !== 0 || gib || chroma !== 0) {
          cell.dx += dx;
          cell.dy += dy;
          if (gib) {
            const pick = ((cell.col * 31 + cell.row * 17) >>> 0) % GIBBERISH.length;
            cell.charOverride = GIBBERISH.charAt(pick);
            cell.colorOverride = colorGlitch;
          } else if (chroma !== 0) {
            cell.colorOverride = chroma > 0 ? chromaColorA : chromaColorB;
          }
        }
      }
    }, { priority: 400 });
  },
};
