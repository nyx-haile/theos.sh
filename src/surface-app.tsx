import { onCleanup, onMount } from 'solid-js';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';
import { generateColorScheme } from './color/scheme';
import { ASCIIRenderer } from './renderers/ascii';
import { Applicator } from './applicator';
import { createSurfaceCellsEffect } from './effects/base/surface-cells';
import { WALK_SCENE_EFFECTS } from './effects/registry';
import type { Frame } from './surface-game/types';
import {
  browserTitleCapabilities,
  resolveTitlePolicy,
  titleModeFromHref,
} from './title-policy';

function seedFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  const clean = hex.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}

const CELL_W = 10, CELL_H = 16;

export default function SurfaceApp() {
  const url = new URL(location.href);
  const urlSeed = url.searchParams.get('seed') ?? '00';
  const testClock = url.searchParams.get('testClock') === '1';
  const seed = seedFromHex(urlSeed);
  const scheme = generateColorScheme(seed);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const titlePolicy = resolveTitlePolicy({
    seed,
    mode: titleModeFromHref(url.href),
    reducedMotion,
    capabilities: browserTitleCapabilities(
      navigator as Navigator & { deviceMemory?: number },
    ),
  });
  const game = createGame(seed, undefined, { includeArtifacts: false, titlePolicy });

  const keys: KeyState = applyKeys({});

  let canvasRef: HTMLCanvasElement | undefined;

  let raf = 0;
  let startNow = 0;
  let lastNow = 0;
  let testElapsedMs = 0;
  let app: Applicator | null = null;
  const frameRef: Frame = { cells: [], cellsWide: 0, cellsHigh: 0 };

  function renderOneFrame(elapsedMs: number, dt: number): void {
    game.tick(dt, keys);
    const frame = game.frame();
    frameRef.cells = frame.cells;
    frameRef.cellsWide = frame.cellsWide;
    frameRef.cellsHigh = frame.cellsHigh;
    app?.tickFrame(elapsedMs);
  }

  function loop(now: number) {
    const elapsedMs = now - startNow;
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    renderOneFrame(elapsedMs, dt);
    raf = requestAnimationFrame(loop);
  }

  function stepTestFrames(frames = 1, dtMs = 16): void {
    for (let i = 0; i < frames; i++) {
      testElapsedMs += dtMs;
      renderOneFrame(testElapsedMs, dtMs / 1000);
    }
  }

  if ((import.meta as any).env?.DEV || testClock) {
    (window as any).theos = {
      ...(window as any).theos,
      game,
      titlePolicy,
      tunables: game.tunables,
      test: {
        step: stepTestFrames,
        setKey: (k: keyof KeyState, v: boolean) => { keys[k] = v; },
        setKeys: (partial: Partial<KeyState>) => { Object.assign(keys, partial); },
        get elapsedMs() { return testElapsedMs; },
      },
    };
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
    const renderer = new ASCIIRenderer(c2d, CELL_W, CELL_H);
    app = new Applicator({ seed, scheme, rows: cellsHigh, cols: cellsWide, cellW: CELL_W, cellH: CELL_H, renderer });
    for (const e of WALK_SCENE_EFFECTS) e.register(app);
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();

    document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

    if (testClock) {
      renderOneFrame(0, 0);
    } else {
      startNow = performance.now();
      lastNow = startNow;
      raf = requestAnimationFrame(loop);
    }
  });
  onCleanup(() => {
    cancelAnimationFrame(raf);
    app?.dispose();
  });

  return (
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
  );
}
