import type { Effect } from '../../applicator/types';
import { gate } from '../gates';

const CHAR_PALETTES: string[][] = [
  [' ', '.', ':', '*', '#'],
  [' ', '·', '○', '◎', '●'],
  [' ', '.', '+', '*', '@'],
  [' ', ',', ';', '%', '&'],
  [' ', '-', '=', '≡', '█'],
  [' ', '`', '\'', '"', '^'],
];

export const charsetVariantEffect: Effect = {
  name: 'charset-variant',
  register(app) {
    app.on('init', ({ seed }) => {
      const u = gate(seed, 'charsetVariant');
      const idx = Math.min(CHAR_PALETTES.length - 1, Math.floor(u * CHAR_PALETTES.length));
      app.context().palette = CHAR_PALETTES[idx]!;
    });
  },
};
