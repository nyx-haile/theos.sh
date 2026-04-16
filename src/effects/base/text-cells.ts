import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';
import { isRevealed } from './reveal';

export const textCellsEffect: Effect = {
  name: 'text-cells',
  register(app) {
    app.registerCellContributor('text-cells', (cell, ctx) => {
      // Map screen cell to world position; the text mask lives at world origin.
      const worldRow = cell.row + ctx.viewportRow;
      const worldCol = cell.col + ctx.viewportCol;
      if (worldRow < 0 || worldRow >= ctx.rows || worldCol < 0 || worldCol >= ctx.cols) return;
      const idx = worldRow * ctx.cols + worldCol;
      const layer = ctx.layerMask[idx];
      if (layer === undefined || layer <= 0) return;
      if (!isRevealed(idx)) return;
      const density = ctx.textDensity[idx]!;
      cell.layer = layer === 3 ? 'face' : 'shadow';
      cell.density = layer === 3 ? density / 4 : 0.35 + (density / 4) * 0.25;
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
