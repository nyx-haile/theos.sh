import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';
import { DetailView, type DetailClient } from './game/detail-view';
import { generateColorScheme } from './color/scheme';
import { ASCIIRenderer } from './renderers/ascii';
import { createRenderContext } from './applicator/context';
import type { CellState, RenderContext } from './renderers/types';
import { createCellState, resetCellState } from './renderers/types';
import { hsvToRgbString } from './renderers/hsv-to-rgb';

const surfaceClient: DetailClient = {
  fetchArtifactText: async (handle) =>
    `# artifact ${handle}\n\nyou stand on a ridge of the surface.\nthe terrain remembers nothing about you, and yet you are here.\n`,
};

function seedFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  const clean = hex.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}

const CELL_W = 10, CELL_H = 16;

export default function SurfaceApp() {
  const urlSeed = new URL(location.href).searchParams.get('seed') ?? '00';
  const seed = seedFromHex(urlSeed);
  const scheme = generateColorScheme(seed);
  const game = createGame(seed);

  if ((import.meta as any).env?.DEV) {
    (window as any).theos = { ...(window as any).theos, game, tunables: game.tunables };
  }

  const keys: KeyState = applyKeys({});
  const [hintVisible, setHintVisible] = createSignal(false);
  const [openHandle, setOpenHandle] = createSignal<string | null>(null);

  let canvasRef: HTMLCanvasElement | undefined;

  const downMap: Record<string, keyof KeyState> = {
    w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', r: 'r', f: 'f',
  };

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && hintVisible() && !openHandle()) {
      const near = game.nearestArtifact();
      if (near) setOpenHandle(`surface-${near.artifact.id}`);
      return;
    }
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = true;
  }
  function onKeyUp(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = false;
  }

  let raf = 0;
  let lastNow = performance.now();
  let ctx: RenderContext | null = null;
  let renderer: ASCIIRenderer | null = null;
  let cells: CellState[] = [];

  function loop(now: number) {
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    if (!openHandle()) game.tick(dt, keys);
    const frame = game.frame();

    if (ctx && renderer) {
      const rows = ctx.rows, cols = ctx.cols;
      ctx.frame.elapsed = now;
      ctx.frame.dt = dt * 1000;
      ctx.frame.timePhase = (now / 800) * Math.PI * 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const cell = cells[idx]!;
          resetCellState(cell);
          cell.row = r; cell.col = c;
          const sc = frame.cells[idx]!;
          cell.charOverride = sc.glyph;
          const t = sc.luminance;
          const { primary: p, accent: a } = scheme;
          const rr = (p.r + (a.r - p.r) * t) / 255;
          const gg = (p.g + (a.g - p.g) * t) / 255;
          const bb = (p.b + (a.b - p.b) * t) / 255;
          cell.colorOverride = `rgb(${Math.round(rr*255)},${Math.round(gg*255)},${Math.round(bb*255)})`;
        }
      }
      renderer.drawFrame(cells, ctx);
    }

    setHintVisible(game.nearestArtifact() !== null);
    raf = requestAnimationFrame(loop);
  }

  onMount(() => {
    if (!canvasRef) return;
    const cellsWide = game.tunables.renderer.cellsWide;
    const cellsHigh = game.tunables.renderer.cellsHigh;
    canvasRef.width = cellsWide * CELL_W;
    canvasRef.height = cellsHigh * CELL_H;
    const c2d = canvasRef.getContext('2d')!;
    c2d.font = `bold ${CELL_H}px ui-monospace, Menlo, monospace`;
    c2d.textBaseline = 'alphabetic';
    renderer = new ASCIIRenderer(c2d, CELL_W, CELL_H);
    ctx = createRenderContext({ rows: cellsHigh, cols: cellsWide, cellW: CELL_W, cellH: CELL_H, scheme });
    cells = new Array(cellsHigh * cellsWide);
    for (let r = 0; r < cellsHigh; r++) for (let c = 0; c < cellsWide; c++) cells[r * cellsWide + c] = createCellState(r, c);
    renderer.init(ctx);

    document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    cancelAnimationFrame(raf);
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          'image-rendering': 'pixelated',
        }}
      />
      <Show when={hintVisible() && !openHandle()}>
        <div data-testid="proximity-hint" style={{ display: 'none' }} />
      </Show>
      <Show when={openHandle()}>
        <DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} />
      </Show>
    </>
  );
}
