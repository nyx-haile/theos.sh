import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';
import { isRevealed } from './reveal';

export const textCellsEffect: Effect = {
  name: 'text-cells',
  register(app) {
    app.registerCellContributor('text-cells', (cell, ctx) => {
      const idx = cell.row * ctx.cols + cell.col;
      const layer = ctx.layerMask[idx];
      if (layer === undefined || layer <= 0) return;
      if (!isRevealed(idx)) return;
      const density = ctx.textDensity[idx]!;
      cell.layer = layer === 3 ? 'face' : 'shadow';
      cell.density = density / 4;
      const baseScale = layer === 3 ? 1.8 + density * 0.12 : 0.5;
      const { secondary: s } = ctx.scheme;
      const r = Math.min(1, s.r * baseScale / 255);
      const g = Math.min(1, s.g * baseScale / 255);
      const b = Math.min(1, s.b * baseScale / 255);
      const [h, sat, v] = rgbToHsv(r, g, b);
      cell.hue = h; cell.saturation = sat; cell.value = v;
    }, { priority: 300 });
  },
};
