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
        const satAt = ctx.satField[idx] ?? 1;
        const { primary: p, secondary: s, accent: a } = ctx.scheme;
        if (sc.hitKind === 'terrain') {
          cell.charOverride = sc.glyph;
          cell.layer = 'face';
          cell.density = sc.luminance;
          const tt = sc.luminance;
          const r = (p.r + (a.r - p.r) * tt) * satAt / 255;
          const g = (p.g + (a.g - p.g) * tt) * satAt / 255;
          const b = (p.b + (a.b - p.b) * tt) * satAt / 255;
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa; cell.value = v;
        } else if (sc.hitKind === 'artifact') {
          cell.charOverride = sc.glyph;
          cell.layer = 'shadow';
          cell.density = Math.max(0.3, sc.luminance);
          const boost = 1.3;
          const r = Math.min(1, s.r * boost / 255);
          const g = Math.min(1, s.g * boost / 255);
          const b = Math.min(1, s.b * boost / 255);
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa; cell.value = v;
        } else if (sc.hitKind === 'title') {
          // Density-indexed glyph via charset-variant palette — no charOverride.
          cell.layer = 'face';
          const rawDensity = sc.luminance * 9;
          cell.density = rawDensity / 4;
          const baseScale = 1.8 + rawDensity * 0.12;
          const r = Math.min(1, s.r * baseScale / 255);
          const g = Math.min(1, s.g * baseScale / 255);
          const b = Math.min(1, s.b * baseScale / 255);
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa * satAt; cell.value = v;
        } else if (sc.hitKind === 'title-shadow') {
          cell.layer = 'shadow';
          cell.density = 0.35;
          const baseScale = 0.5;
          const r = Math.min(1, s.r * baseScale / 255);
          const g = Math.min(1, s.g * baseScale / 255);
          const b = Math.min(1, s.b * baseScale / 255);
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa * satAt; cell.value = v;
        }
        // Sky and any other hitKind: leave background-wave's contribution intact.
      }, { priority: 250 });
    },
  };
}
