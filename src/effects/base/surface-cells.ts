import type { Effect } from '../../applicator/types';
import type { CellState, RenderContext } from '../../renderers/types';
import type { Frame } from '../../surface-game/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';

export type FrameRef = Frame;

export function createSurfaceCellsEffect(frameRef: FrameRef): Effect {
  return {
    name: 'surface-cells',
    register(app) {
      app.registerCellContributor('surface-cells', (cell: CellState, ctx: RenderContext) => {
        const idx = cell.row * ctx.cols + cell.col;
        if (idx >= frameRef.cells.length) return;
        const sc = frameRef.cells[idx]!;
        cell.charOverride = sc.glyph;
        const satAt = ctx.satField[idx] ?? 1;
        const { primary: p, secondary: s, accent: a } = ctx.scheme;
        if (sc.hitKind === 'terrain') {
          cell.layer = 'face';
          cell.density = sc.luminance;
          const t = sc.luminance;
          const r = (p.r + (a.r - p.r) * t) * satAt / 255;
          const g = (p.g + (a.g - p.g) * t) * satAt / 255;
          const b = (p.b + (a.b - p.b) * t) * satAt / 255;
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa; cell.value = v;
        } else if (sc.hitKind === 'artifact') {
          cell.layer = 'shadow';
          cell.density = Math.max(0.3, sc.luminance);
          const boost = 1.3;
          const r = Math.min(1, s.r * boost / 255);
          const g = Math.min(1, s.g * boost / 255);
          const b = Math.min(1, s.b * boost / 255);
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa; cell.value = v;
        } else if (sc.hitKind === 'title') {
          cell.layer = 'face';
          cell.density = Math.max(0.6, sc.luminance);
          const boost = 1.4;
          const r = Math.min(1, a.r * boost / 255);
          const g = Math.min(1, a.g * boost / 255);
          const b = Math.min(1, a.b * boost / 255);
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa * satAt; cell.value = v;
        } else {
          cell.layer = 'void';
          cell.density = 0;
          cell.value = 0;
        }
      }, { priority: 250 });
    },
  };
}
