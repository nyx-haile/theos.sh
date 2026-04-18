import { onMount, onCleanup, createSignal, Show } from 'solid-js';
import { runOriginPhase } from './origin/anchor';
import { generateColorScheme } from './color/scheme';
import { Applicator } from './applicator';
import { ASCIIRenderer } from './renderers/ascii';
import { registerAll, makeHintOverlayEffect, makeHintTooltipEffect } from './effects/registry';
import { ContentRegistry } from './content/registry';
import { createManifoldFn } from './manifold/manifold-fn';
import { ViewportManager } from './viewport/viewport-manager';
import { createVisibilityStore } from './game/visibility-store';
import { createSessionClient } from './game/session-client';
import { attachFixedBindings } from './game/fixed-bindings';
import { DetailView } from './game/detail-view';
import type { ContentModule } from './content/types';

const CELL_W = 15, CELL_H = 15;

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;
  const [hintVisible, setHintVisible] = createSignal(false);
  const [openHandle, setOpenHandle] = createSignal<string | null>(null);

  const client = createSessionClient();

  onMount(() => {
    if (!canvasRef) return;
    try {
      const { seed } = runOriginPhase();
      const scheme = generateColorScheme(seed);
      const rect = canvasRef.getBoundingClientRect();
      const width  = Math.round(rect.width)  || document.documentElement.clientWidth;
      const height = Math.round(rect.height) || document.documentElement.clientHeight;
      const cols = Math.floor(width / CELL_W);
      const rows = Math.floor(height / CELL_H);
      canvasRef.width = width; canvasRef.height = height;
      document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

      const canvas2d = canvasRef.getContext('2d')!;
      const renderer = new ASCIIRenderer(canvas2d, CELL_W, CELL_H);
      const app = new Applicator({ seed, scheme, rows, cols, cellW: CELL_W, cellH: CELL_H, renderer });

      // --- game layer ---
      const stubModule: ContentModule = {
        id: 'stub', type: 'origin',
        render_hints: { tier1: { splat_scale: 1, sdf_morph: false }, tier2: { warp_intensity: 0, sdf_morph: false }, tier3: { ascii_density: 1, border_char: '.' } },
        content: '', interactions: [],
      };
      const contentReg = new ContentRegistry([stubModule]);
      const manifoldFn = createManifoldFn(seed, contentReg.length);
      const vm = new ViewportManager(manifoldFn, contentReg, 2);
      const store = createVisibilityStore();

      const viewportCenterFn = () => ({
        centerCol: Math.round(vm.position[0]) + Math.floor(cols / 2),
        centerRow: Math.round(vm.position[1]) + Math.floor(rows / 2),
      });
      const hintEffect = makeHintOverlayEffect(() => store, viewportCenterFn);
      const tooltipEffect = makeHintTooltipEffect(() => store, viewportCenterFn);

      // register effects (including hint overlay + tooltip)
      registerAll(app);
      hintEffect.register(app);
      tooltipEffect.register(app);
      app.boot();

      // fixed bindings: WASD/arrows
      const disposeBindings = attachFixedBindings(window, (op) => {
        vm.dispatch(op);
        store.updateViewport({
          centerCol: Math.round(vm.position[0]),
          centerRow: Math.round(vm.position[1]),
        });
      });

      // async session + visibility
      client.openSession(seed)
        .then(s => client.fetchVisibility(s.sessionId, { centerCol: vm.position[0], centerRow: vm.position[1], radius: 20 }))
        .then(v => store.replace(v.visible, { centerCol: vm.position[0], centerRow: vm.position[1] }))
        .catch(e => console.warn('game boot: visibility unavailable', e));

      // Enter key handler
      const onEnter = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && hintVisible() && !openHandle()) {
          const near = store.inProximityOf(1.5);
          if (near) setOpenHandle(near.handle);
        }
      };
      window.addEventListener('keydown', onEnter);

      // rAF loop
      let rafId = 0;
      const start = performance.now();
      const ctx = app.context();
      const tick = (now: number) => {
        ctx.viewportCol = Math.round(vm.position[0]);
        ctx.viewportRow = Math.round(vm.position[1]);
        app.tickFrame(now - start);

        // per-frame proximity check
        const near = store.inProximityOf(1.5);
        setHintVisible(!!near);

        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      onCleanup(() => {
        cancelAnimationFrame(rafId);
        disposeBindings();
        window.removeEventListener('keydown', onEnter);
        app.dispose();
      });
    } catch (e) {
      console.error('App error:', e);
    }
  });

  return (
    <>
      <canvas ref={canvasRef} style={{ display:'block', width:'100vw', height:'100vh', margin:0, padding:0 }} />
      <Show when={hintVisible() && !openHandle()}>
        <div data-testid="proximity-hint" style={{ display: 'none' }} />
      </Show>
      <Show when={openHandle()}>
        <DetailView handle={openHandle()!} client={client} onClose={() => setOpenHandle(null)} />
      </Show>
    </>
  );
}
