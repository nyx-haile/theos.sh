import type { Effect } from '../../applicator/types';
import { effectPrng } from '../prng';

export const curvatureFieldEffect: Effect = {
  name: 'curvature-field',
  register(app) {
    app.on('buildFields', () => {
      const { rows, cols, curvField } = app.context();
      const seed = app.manifoldState().seed;
      const prng = effectPrng(seed, 'curvature-field');
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = (col - cols / 2) / cols;
          const cy = (row - rows / 2) / rows;
          const r = Math.sqrt(cx * cx + cy * cy);
          const noise = (prng.nextFloat() - 0.5) * 0.15;
          curvField[row * cols + col] = 1.0 + 0.08 * Math.sin(r * 6.28318) + noise;
        }
      }
    }, { priority: 0 });
  },
};
