import type { Effect } from '../../applicator/types';
import { gateParam } from '../gates';

const MASK_SCALE = 4;
const LINES_STACKED = ['the', ' os', '.sh'];
const LINE_SINGLE = 'theos.sh';

function drawMaskCanvas(cols: number, rows: number, weight: 'normal' | 'bold'): Uint8Array {
  const w = cols, h = rows;
  const canvas = document.createElement('canvas');
  canvas.width  = w * MASK_SCALE;
  canvas.height = h * MASK_SCALE;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#fff';
  const stacked = w < 40;
  const fontSize = stacked ? Math.floor(h * MASK_SCALE * 0.28) : Math.floor(h * MASK_SCALE * 0.56);
  g.font = `${weight} ${fontSize}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stacked) {
    const cx = (w * MASK_SCALE) / 2;
    const total = LINES_STACKED.length * fontSize;
    const startY = (h * MASK_SCALE - total) / 2 + fontSize / 2;
    for (let i = 0; i < LINES_STACKED.length; i++) g.fillText(LINES_STACKED[i]!, cx, startY + i * fontSize);
  } else {
    g.fillText(LINE_SINGLE, (w * MASK_SCALE) / 2, (h * MASK_SCALE) / 2);
  }
  const img = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const sx = col * MASK_SCALE + Math.floor(MASK_SCALE / 2);
      const sy = row * MASK_SCALE + Math.floor(MASK_SCALE / 2);
      const i = (sy * canvas.width + sx) * 4;
      out[row * w + col] = img[i + 3]!;
    }
  }
  return out;
}

export const textMaskEffect: Effect = {
  name: 'text-mask',
  register(app) {
    app.on('buildMask', () => {
      const ctx = app.context();
      const { rows, cols, rawFacePixels, layerMask } = ctx;
      const seed = app.manifoldState().seed;
      const weight = gateParam(seed, 'fontVariation', 'weight') < 0.5 ? 'normal' : 'bold';
      const pixels = drawMaskCanvas(cols, rows, weight);
      rawFacePixels.set(pixels);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const alpha = ctx.sampleFace(col, row);
          if (alpha > 64) layerMask[row * cols + col] = 3;
        }
      }
    }, { priority: 110 });

    app.on('maskReady', () => {
      const { rows, cols, layerMask, textDensity } = app.context();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (layerMask[row * cols + col] !== 3) { textDensity[row * cols + col] = 0; continue; }
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr, c = col + dc;
            if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
            if (layerMask[r * cols + c] === 3) n++;
          }
          textDensity[row * cols + col] = n;
        }
      }
    }, { priority: 100 });
  },
};
