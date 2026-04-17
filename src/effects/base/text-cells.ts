import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';
import { isRevealed } from './reveal';

const FADE_BAND = 5; // cells from buffer edge over which shadow/face fades out

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

      // Fade near buffer edges so shadow doesn't hard-clip
      const edgeDist = Math.min(worldRow, worldCol, ctx.rows - 1 - worldRow, ctx.cols - 1 - worldCol);
      const fade = edgeDist >= FADE_BAND ? 1 : (edgeDist + 1) / (FADE_BAND + 1);

      const density = ctx.textDensity[idx]!;
      cell.layer = layer === 3 ? 'face' : 'shadow';
      cell.density = (layer === 3 ? density / 4 : 0.35 + (density / 4) * 0.25) * fade;
      const baseScale = layer === 3 ? 1.8 + density * 0.12 : 0.5;
      const { secondary: s } = ctx.scheme;
      const r = Math.min(1, s.r * baseScale / 255);
      const g = Math.min(1, s.g * baseScale / 255);
      const b = Math.min(1, s.b * baseScale / 255);
      const [h, sat, v] = rgbToHsv(r, g, b);
      cell.hue = h; cell.saturation = sat; cell.value = v * fade;
    }, { priority: 300 });
  },
};
