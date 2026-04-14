import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';

export const fontVariationEffect: Effect = {
  name: 'font-variation',
  register(app) {
    app.on('init', ({ seed }) => {
      const active = gate(seed, 'fontVariation') < 0.50;
      const weight = gateParam(seed, 'fontVariation', 'weight') < 0.5 ? 'normal' : 'bold';
      const sizeVar = active ? (gateParam(seed, 'fontVariation', 'size') * 0.30 - 0.15) : 0;
      const px = Math.round(22 * (1 + sizeVar));
      app.context().asciiFont = `${weight} ${px}px monospace`;
    });
  },
};
