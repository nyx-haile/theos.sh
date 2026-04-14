import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';
import { effectPrng } from '../prng';

declare module '../../signals/catalog' {
  interface SignalMap {
    'glitch:burst': { rowStart: number; rowEnd: number; intensity: number };
  }
}

interface BurstSource {
  centerRow: number;
  spanRows:  number;
  p1: number;
  p2: number;
  phase1: number;
  phase2: number;
  shift: number;
  amp: number;
}

const GIBBERISH = '█▓▒░#%$&@?!*+=<>/\\|[]{}()~^`;:\'"';

export const jitterEffect: Effect = {
  name: 'jitter',
  register(app) {
    let baseActive = false;
    let baseAmp = 0;
    let burstActive = false;
    const sources: BurstSource[] = [];
    let activeRows: Uint8Array | null = null;
    let shiftRows: Int16Array | null = null;
    let colorGlitch = 'rgb(255,255,255)';

    app.on('maskReady', () => {
      const seed = app.manifoldState().seed;
      const ctx = app.context();
      baseActive = gate(seed, 'jitter') < 0.35;
      baseAmp    = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2;
      burstActive = gate(seed, 'cellGlitch') < 0.50;
      const { rows } = ctx;
      activeRows = new Uint8Array(rows);
      shiftRows  = new Int16Array(rows);
      sources.length = 0;
      if (burstActive) {
        const prng = effectPrng(seed, 'jitter:burst');
        const n = 5 + Math.floor(prng.nextFloat() * 4);
        for (let k = 0; k < n; k++) {
          sources.push({
            centerRow: Math.floor(prng.nextFloat() * rows),
            spanRows:  1 + Math.floor(prng.nextFloat() * 4),
            p1: 0.15 + prng.nextFloat() * 0.45,
            p2: 0.5  + prng.nextFloat() * 2.5,
            phase1: prng.nextFloat() * Math.PI * 2,
            phase2: prng.nextFloat() * Math.PI * 2,
            shift: (prng.nextFloat() - 0.5) * 14,
            amp:   0.4 + prng.nextFloat() * 0.8,
          });
        }
      }
      const s = ctx.scheme.secondary;
      colorGlitch = `rgb(${Math.min(255, Math.round(s.r * 2.5))},${Math.min(255, Math.round(s.g * 2.5))},${Math.min(255, Math.round(s.b * 2.5))})`;
    }, { priority: 200 });

    app.on('frameBegin', ({ elapsed }, busCtx) => {
      if (!activeRows || !shiftRows) return;
      activeRows.fill(0); shiftRows.fill(0);
      if (!burstActive) return;
      const tSec = elapsed / 1000;
      for (const src of sources) {
        const a = Math.sin(src.phase1 + (Math.PI * 2 * tSec) / src.p1);
        const b = Math.sin(src.phase2 + (Math.PI * 2 * tSec) / src.p2);
        const signed = a * b; // ∈ [-1, 1] — sign alternates with beat
        const amp = Math.abs(signed) * src.amp;
        if (amp < 0.25) continue;
        const rowStart = Math.max(0, src.centerRow - src.spanRows);
        const rowEnd   = Math.min(activeRows.length - 1, src.centerRow + src.spanRows);
        for (let r = rowStart; r <= rowEnd; r++) {
          activeRows[r] = 1;
          shiftRows[r]  = Math.round(src.shift * signed * src.amp);
        }
        busCtx.emit('glitch:burst', { rowStart, rowEnd, intensity: amp });
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
      if (activeRows && shiftRows && activeRows[cell.row] === 1) {
        const shift = shiftRows[cell.row]!;
        cell.dx += shift;
        if (Math.abs(shift) >= 3) {
          const pick = ((cell.col * 31 + cell.row * 17) >>> 0) % GIBBERISH.length;
          cell.charOverride = GIBBERISH.charAt(pick);
          cell.colorOverride = colorGlitch;
        }
      }
    }, { priority: 400 });
  },
};
