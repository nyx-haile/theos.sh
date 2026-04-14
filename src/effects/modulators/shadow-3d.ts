import type { Effect } from '../../applicator/types';
import { gateParam } from '../gates';

export const shadow3dEffect: Effect = {
  name: 'shadow-3d',
  register(app) {
    app.on('buildMask', () => {
      const ctx = app.context();
      const seed = app.manifoldState().seed;
      const { rows, cols, layerMask } = ctx;
      const angle = gateParam(seed, 'shadow3D', 'angle') * Math.PI * 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const maxDist = Math.max(rows, cols);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (layerMask[row * cols + col] !== 3) continue;
          for (let d = 1; d <= maxDist; d++) {
            const sr = Math.round(row + dy * d);
            const sc = Math.round(col + dx * d);
            if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) break;
            const idx = sr * cols + sc;
            if (layerMask[idx] === 0) layerMask[idx] = 1;
            else if (layerMask[idx] === 3) break;
          }
        }
      }
    }, { priority: 120 });
  },
};
