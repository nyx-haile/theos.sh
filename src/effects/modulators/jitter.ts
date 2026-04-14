import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';
import { effectPrng } from '../prng';

declare module '../../signals/catalog' {
  interface SignalMap {
    'glitch:burst': { rowStart: number; rowEnd: number; intensity: number };
  }
}

interface GlitchEvent {
  startMs:     number;
  durationMs:  number;
  rowStart:    number;
  rowEnd:      number;
  colStart:    number;
  colEnd:      number;
  shiftDx:     number;
  shiftDy:     number;
  gibberish:   boolean;
}

const GIBBERISH = '█▓▒░#%$&@?!*+=<>/\\|[]{}()~^`;:\'"';
const EVENT_HORIZON_MS = 60_000;
const SLOT_MS          = 220;
const SLOT_HIT_PROB    = 0.30;
const GEOM_P           = 0.9;

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
    let colorGlitch = 'rgb(255,255,255)';

    app.on('maskReady', () => {
      const seed = app.manifoldState().seed;
      const ctx = app.context();
      const { rows, cols } = ctx;
      baseActive = gate(seed, 'jitter') < 0.35;
      baseAmp    = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2;
      burstActive = gate(seed, 'cellGlitch') < 0.50;
      shiftDx       = new Int16Array(rows * cols);
      shiftDy       = new Int16Array(rows * cols);
      gibberishMask = new Uint8Array(rows * cols);
      events.length = 0;
      if (burstActive) {
        const prng = effectPrng(seed, 'jitter:events');
        for (let t = 0; t < EVENT_HORIZON_MS; t += SLOT_MS) {
          if (prng.nextFloat() > SLOT_HIT_PROB) continue;
          const u = prng.nextFloat();
          const count = Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - GEOM_P)));
          for (let k = 0; k < count; k++) {
            const vertical = prng.nextFloat() < 0.35;
            const rowStart = Math.floor(prng.nextFloat() * rows);
            const rowSpan  = vertical ? rows : 1 + Math.floor(prng.nextFloat() * 5);
            const colStart = Math.floor(prng.nextFloat() * cols);
            const colSpan  = vertical ? 1 + Math.floor(prng.nextFloat() * 4) : 3 + Math.floor(prng.nextFloat() * 15);
            events.push({
              startMs:    t + prng.nextFloat() * SLOT_MS,
              durationMs: 40 + prng.nextFloat() * 80,
              rowStart:   vertical ? 0 : rowStart,
              rowEnd:     vertical ? rows - 1 : Math.min(rows - 1, rowStart + rowSpan - 1),
              colStart,
              colEnd:     Math.min(cols - 1, colStart + colSpan - 1),
              shiftDx:    Math.round((prng.nextFloat() - 0.5) * 14),
              shiftDy:    Math.round((prng.nextFloat() - 0.5) * 4),
              gibberish:  prng.nextFloat() < 0.55,
            });
          }
        }
      }
      const s = ctx.scheme.secondary;
      colorGlitch = `rgb(${Math.min(255, Math.round(s.r * 2.5))},${Math.min(255, Math.round(s.g * 2.5))},${Math.min(255, Math.round(s.b * 2.5))})`;
    }, { priority: 200 });

    app.on('frameBegin', ({ elapsed }, busCtx) => {
      if (!shiftDx || !shiftDy || !gibberishMask) return;
      shiftDx.fill(0); shiftDy.fill(0); gibberishMask.fill(0);
      if (!burstActive) return;
      const cols = app.context().cols;
      for (const ev of events) {
        if (elapsed < ev.startMs || elapsed >= ev.startMs + ev.durationMs) continue;
        for (let r = ev.rowStart; r <= ev.rowEnd; r++) {
          const rowBase = r * cols;
          for (let c = ev.colStart; c <= ev.colEnd; c++) {
            const idx = rowBase + c;
            shiftDx[idx] = ev.shiftDx;
            shiftDy[idx] = ev.shiftDy;
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
      if (shiftDx && shiftDy && gibberishMask) {
        const idx = cell.row * rctx.cols + cell.col;
        const dx = shiftDx[idx]!, dy = shiftDy[idx]!;
        if (dx !== 0 || dy !== 0) {
          cell.dx += dx;
          cell.dy += dy;
          if (gibberishMask[idx] === 1) {
            const pick = ((cell.col * 31 + cell.row * 17) >>> 0) % GIBBERISH.length;
            cell.charOverride = GIBBERISH.charAt(pick);
            cell.colorOverride = colorGlitch;
          }
        }
      }
    }, { priority: 400 });
  },
};
