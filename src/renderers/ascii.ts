import type { Renderer, Frame, RenderContext } from './types';
import { hsvToRgbString } from './hsv-to-rgb';

function clampDensityIndex(d: number): number {
  return Math.min(4, Math.max(0, Math.floor(d * 5)));
}

function schemeBgCss(scheme: RenderContext['scheme']): string {
  const { r, g, b } = scheme.background;
  return `rgb(${r},${g},${b})`;
}

export class ASCIIRenderer implements Renderer {
  constructor(
    private canvas2d: CanvasRenderingContext2D,
    private cellW: number,
    private cellH: number,
  ) {}

  init(_ctx: RenderContext): void {}

  drawFrame(frame: Frame, ctx: RenderContext): void {
    if (ctx.asciiFont && this.canvas2d.font !== ctx.asciiFont) this.canvas2d.font = ctx.asciiFont;
    this.canvas2d.fillStyle = schemeBgCss(ctx.scheme);
    this.canvas2d.fillRect(0, 0, ctx.cols * this.cellW, ctx.rows * this.cellH);
    for (let i = 0; i < frame.length; i++) {
      const cell = frame[i]!;
      const char  = cell.charOverride  ?? ctx.palette[clampDensityIndex(cell.density)] ?? ' ';
      const color = cell.colorOverride ?? hsvToRgbString(cell.hue, cell.saturation, cell.value);
      this.canvas2d.fillStyle = color;
      this.canvas2d.fillText(
        char,
        cell.col * this.cellW + cell.dx * this.cellW,
        (cell.row + 1) * this.cellH - 2 + cell.dy * this.cellH,
      );
    }
  }

  dispose(): void {}
}
