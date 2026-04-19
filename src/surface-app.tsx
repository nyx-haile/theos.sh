import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';
import { DetailView, type DetailClient } from './game/detail-view';
import { generateColorScheme } from './color/scheme';
import { ASCIIRenderer } from './renderers/ascii';
import { Applicator } from './applicator';
import { createSurfaceCellsEffect } from './effects/base/surface-cells';
import { TITLE_SCENE_EFFECTS } from './effects/registry';
import { startDissolve, __resetReveal } from './effects/base/reveal';
import { createSceneMachine } from './surface-game/scene';
import type { Frame } from './surface-game/types';

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

const DISSOLVE_DURATION_MS = 1500;

const TITLE_EFFECTS_TO_UNREGISTER = [
  'text-mask',
  'text-cells',
  'reveal',
  'manifold-genus',
] as const;

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

  let raf = 0;
  let startNow = 0;
  let lastNow = 0;
  let app: Applicator | null = null;
  const frameRef: Frame = { cells: [], cellsWide: 0, cellsHigh: 0 };
  const scene = createSceneMachine();
  let walkRegsRegistered = false;

  function triggerDissolveIfTitle(now: number) {
    if (scene.state() !== 'title') return;
    scene.startDissolve(now, DISSOLVE_DURATION_MS);
    startDissolve(now, DISSOLVE_DURATION_MS);
  }

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && hintVisible() && !openHandle()) {
      const near = game.nearestArtifact();
      if (near) setOpenHandle(`surface-${near.artifact.id}`);
      return;
    }
    const k = downMap[ev.key.toLowerCase()];
    if (k) {
      triggerDissolveIfTitle(performance.now() - startNow);
      if (scene.state() === 'walk') keys[k] = true;
    }
  }
  function onKeyUp(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = false;
  }

  function loop(now: number) {
    const elapsedMs = now - startNow;
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;

    const sceneState = scene.tick(elapsedMs);
    if (sceneState === 'walk' && !walkRegsRegistered) {
      if (app) {
        const slots = (app as any).pipeline?.slots ?? [];
        for (const s of slots) {
          if ((TITLE_EFFECTS_TO_UNREGISTER as readonly string[]).includes(s.name)) {
            app.unregister({ id: s.id, name: s.name });
          }
        }
        createSurfaceCellsEffect(frameRef).register(app);
      }
      walkRegsRegistered = true;
    }

    if (sceneState === 'walk' && !openHandle()) game.tick(dt, keys);
    const frame = game.frame();
    frameRef.cells = frame.cells;
    frameRef.cellsWide = frame.cellsWide;
    frameRef.cellsHigh = frame.cellsHigh;
    app?.tickFrame(elapsedMs);
    setHintVisible(sceneState === 'walk' && game.nearestArtifact() !== null);
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
    const renderer = new ASCIIRenderer(c2d, CELL_W, CELL_H);
    app = new Applicator({ seed, scheme, rows: cellsHigh, cols: cellsWide, cellW: CELL_W, cellH: CELL_H, renderer });
    __resetReveal();
    for (const e of TITLE_SCENE_EFFECTS) e.register(app);
    app.boot();

    document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    startNow = performance.now();
    lastNow = startNow;
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    cancelAnimationFrame(raf);
    app?.dispose();
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
        <DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} scheme={scheme} />
      </Show>
    </>
  );
}
