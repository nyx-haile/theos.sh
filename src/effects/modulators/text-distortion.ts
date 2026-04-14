import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';

export const textDistortionEffect: Effect = {
  name: 'text-distortion',
  register(app) {
    app.on('buildMask', () => {
      const ctx = app.context();
      const seed = app.manifoldState().seed;
      if (gate(seed, 'textDistortion') >= 0.40) return;
      const amplitude = 0.15 + gateParam(seed, 'textDistortion', 'amp') * 0.25;
      const freq      = 0.05 + gateParam(seed, 'textDistortion', 'freq') * 0.15;
      ctx.sampleFace = (col: number, row: number): number => {
        const dxCells = Math.round(ctx.cols * amplitude * Math.sin(row * freq * Math.PI * 2));
        const sc = Math.max(0, Math.min(ctx.cols - 1, col - dxCells));
        return ctx.rawFacePixels[row * ctx.cols + sc] ?? 0;
      };
    }, { priority: 100 });
  },
};
