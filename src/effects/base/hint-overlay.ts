import type { Effect, EffectAppLike } from '../../applicator/types';
import type { CellContributor, CellState, RenderContext } from '../../renderers/types';
import type { VisibilityStore } from '../../game/visibility-store';

export interface HintOverlayEffect extends Effect {
  contribute: CellContributor;
}

export function makeHintOverlayEffect(
  storeFn: () => VisibilityStore,
  viewportCenterFn: () => { centerCol: number; centerRow: number },
): HintOverlayEffect {
  const contribute: CellContributor = (cell: CellState, _ctx: RenderContext) => {
    const store = storeFn();
    const center = viewportCenterFn();
    for (const v of store.visible()) {
      const hintCol = Math.round(center.centerCol + v.relativeOffset.dCol + v.hintCell.dCol);
      const hintRow = Math.round(center.centerRow + v.relativeOffset.dRow + v.hintCell.dRow);
      if (cell.col === hintCol && cell.row === hintRow) {
        cell.density = Math.min(1, cell.density + v.hintCell.densityBoost);
        cell.hue = v.hintCell.accentHue;
        cell.saturation = Math.max(cell.saturation, 0.85);
        cell.value = Math.max(cell.value, 0.85);
      }
    }
  };

  return {
    name: 'hint-overlay',
    contribute,
    register(app: EffectAppLike) {
      // Sort is ascending (lower priority = runs first).
      // background-wave uses priority 200, so we use 250 to run AFTER it.
      app.registerCellContributor('hint-overlay', contribute, { priority: 250 });
    },
  };
}
