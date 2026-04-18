import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';

export const manifoldGenusEffect: Effect = {
  name: 'manifold-genus',
  register(app) {
    app.on('buildFields', () => {
      const ctx = app.context();
      const seed = app.manifoldState().seed;
      if (gate(seed, 'manifoldGenus') >= 0.30) return;

      const u = gateParam(seed, 'manifoldGenus', 'count');
      const p = 0.25 + gateParam(seed, 'manifoldGenus', 'p') * 0.40;
      const genus = Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - p)));

      const { rows, cols, layerMask } = ctx;
      for (let k = 1; k <= genus; k++) {
        const cr = Math.floor(gateParam(seed, `genus:${k}`, 'r') * rows);
        const cc = Math.floor(gateParam(seed, `genus:${k}`, 'c') * cols);
        const R  = 2 + Math.floor(gateParam(seed, `genus:${k}`, 'R') * 4);
        for (let row = Math.max(0, cr - R); row <= Math.min(rows - 1, cr + R); row++) {
          for (let col = Math.max(0, cc - R); col <= Math.min(cols - 1, cc + R); col++) {
            const dr = row - cr, dc = col - cc;
            if (dr * dr + dc * dc <= R * R) layerMask[row * cols + col] = -1;
          }
        }
      }
    }, { priority: 50 });

    app.registerCellContributor('manifold-genus', (cell, ctx) => {
      const idx = cell.row * ctx.cols + cell.col;
      if (ctx.layerMask[idx] !== -1) return;
      const p = ctx.scheme.primary;
      const [h, s] = rgbToHsv(p.r / 255, p.g / 255, p.b / 255);
      cell.layer = 'void';
      cell.hue = h; cell.saturation = Math.min(0.6, s); cell.value = 0.15;
      cell.density = 0.5;
    }, { priority: 250 });
  },
};
