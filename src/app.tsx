import { onMount, onCleanup } from 'solid-js';
import { runOriginPhase } from './origin/anchor';
import { generateColorScheme } from './color/scheme';
import { Applicator } from './applicator';
import { ASCIIRenderer } from './renderers/ascii';
import { registerAll } from './effects/registry';
import { wireInputMapper } from './input/input-mapper';

const CELL_W = 15, CELL_H = 15;

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;

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
      registerAll(app);
      app.boot();
      const disposeInput = wireInputMapper(app);

      let rafId = 0;
      const start = performance.now();
      const tick = (now: number) => { app.tickFrame(now - start); rafId = requestAnimationFrame(tick); };
      rafId = requestAnimationFrame(tick);

      onCleanup(() => { cancelAnimationFrame(rafId); disposeInput(); app.dispose(); });
    } catch (e) {
      console.error('App error:', e);
    }
  });

  return <canvas ref={canvasRef} style={{ display:'block', width:'100vw', height:'100vh', margin:0, padding:0 }} />;
}
