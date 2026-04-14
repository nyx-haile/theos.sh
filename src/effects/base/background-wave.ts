import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';

export const backgroundWaveEffect: Effect = {
  name: 'background-wave',
  register(app) {
    app.registerCellContributor('background-wave', (cell, ctx) => {
      const idx = cell.row * ctx.cols + cell.col;
      const curv = ctx.curvField[idx]!;
      const wave = 0.015 * Math.sin(ctx.frame.timePhase + cell.col * 0.15 + cell.row * 0.22);
      const animCurv = curv + wave;
      const ci = animCurv > 1.07 ? 4 : animCurv > 1.04 ? 2 : 1;
      cell.layer = 'bg';
      cell.density = ci / 4;
      const sat = ctx.satField[idx]!;
      const t = ci / 4;
      const { primary: p, accent: a } = ctx.scheme;
      const r = (p.r + (a.r - p.r) * t) * sat / 255;
      const g = (p.g + (a.g - p.g) * t) * sat / 255;
      const b = (p.b + (a.b - p.b) * t) * sat / 255;
      const [h, s, v] = rgbToHsv(r, g, b);
      cell.hue = h; cell.saturation = s; cell.value = v;
    }, { priority: 200 });
  },
};
