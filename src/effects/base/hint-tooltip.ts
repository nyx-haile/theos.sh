import type { Effect, EffectAppLike } from '../../applicator/types';
import type { CellContributor, CellState, RenderContext } from '../../renderers/types';
import type { VisibilityStore } from '../../game/visibility-store';

export interface HintTooltipEffect extends Effect {
  contribute: CellContributor;
}

const LABEL = '[enter]';
const ROW_OFFSET = 2;

export function makeHintTooltipEffect(
  storeFn: () => VisibilityStore,
  viewportCenterFn: () => { centerCol: number; centerRow: number },
): HintTooltipEffect {
  const contribute: CellContributor = (cell: CellState, ctx: RenderContext) => {
    const store = storeFn();
    const near = store.inProximityOf(1.5);
    if (!near) return;

    const center = viewportCenterFn();
    const hintCol = Math.round(center.centerCol + near.relativeOffset.dCol + near.hintCell.dCol);
    const hintRow = Math.round(center.centerRow + near.relativeOffset.dRow + near.hintCell.dRow);

    const labelRow = Math.min(ctx.rows - 1, hintRow + ROW_OFFSET);
    if (cell.row !== labelRow) return;

    const labelColStart = hintCol - Math.floor(LABEL.length / 2);
    const i = cell.col - labelColStart;
    if (i < 0 || i >= LABEL.length) return;

    const ch = LABEL[i];
    if (!ch) return;
    cell.charOverride = ch;
    cell.colorOverride = 'rgb(224,224,224)';
  };

  return {
    name: 'hint-tooltip',
    contribute,
    register(app: EffectAppLike) {
      app.registerCellContributor('hint-tooltip', contribute, { priority: 260 });
    },
  };
}
