import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';
import { effectPrng } from '../prng';

interface CurvCenter { x: number; y: number; freq: number; amp: number }

export const backgroundWaveEffect: Effect = {
  name: 'background-wave',
  register(app) {
    let centers: CurvCenter[] = [];

    app.on('buildFields', () => {
      const seed = app.manifoldState().seed;
      const prng = effectPrng(seed, 'wave-centers');
      const n = 5 + Math.floor(prng.nextFloat() * 4); // 5-8 centers
      centers = [];
      for (let i = 0; i < n; i++) {
        centers.push({
          x: (prng.nextFloat() - 0.5) * 200,
          y: (prng.nextFloat() - 0.5) * 200,
          freq: 0.02 + prng.nextFloat() * 0.04,
          amp: 0.03 + prng.nextFloat() * 0.05,
        });
      }
    }, { priority: 5 });

    app.registerCellContributor('background-wave', (cell, ctx) => {
      const worldCol = cell.col + ctx.viewportCol;
      const worldRow = cell.row + ctx.viewportRow;

      // Multi-center curvature from world coordinates
      let curv = 1.0;
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i]!;
        const dx = worldCol - c.x;
        const dy = worldRow - c.y;
        curv += c.amp * Math.sin(Math.sqrt(dx * dx + dy * dy) * c.freq * 6.28318);
      }

      const wave = 0.015 * Math.sin(ctx.frame.timePhase + worldCol * 0.15 + worldRow * 0.22);
      const animCurv = curv + wave;
      const ci = animCurv > 1.07 ? 4 : animCurv > 1.04 ? 2 : 1;
      cell.layer = 'bg';
      cell.density = ci / 4;
      const idx = cell.row * ctx.cols + cell.col;
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
