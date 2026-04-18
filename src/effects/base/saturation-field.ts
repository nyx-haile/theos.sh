import type { Effect } from '../../applicator/types';
import { effectPrng } from '../prng';

export const saturationFieldEffect: Effect = {
  name: 'saturation-field',
  register(app) {
    app.on('buildFields', () => {
      const { rows, cols, satField } = app.context();
      const seed = app.manifoldState().seed;
      const prng = effectPrng(seed, 'saturation-field');
      for (let i = 0; i < rows * cols; i++) {
        satField[i] = 0.6 + 0.4 * prng.nextFloat();
      }
    }, { priority: 10 });
  },
};
