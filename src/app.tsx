import { onMount, onCleanup } from 'solid-js';
import { runOriginPhase } from './origin/anchor';
import { generateColorScheme } from './rendering/color-scheme';
import { ASCIIRenderer } from './rendering/tier-3/ascii-renderer';
import { NarrativeOrchestrator } from './narrative/orchestrator';
import { Xoshiro256 } from './manifold/prng';
import type { Descriptor } from './manifold/types';

const CELL_W = 9;   // px per character (monospace)
const CELL_H = 16;  // px per line height

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;

  onMount(() => {
    if (!canvasRef) return;

    try {
      // Bootstrap from origin phase
      const { seed, tier: _tier } = runOriginPhase();
      const scheme = generateColorScheme(seed);

      // Size canvas to fill viewport
      const width = window.innerWidth;
      const height = window.innerHeight;
      const cols = Math.floor(width / CELL_W);
      const rows = Math.floor(height / CELL_H);

      canvasRef.width = width;
      canvasRef.height = height;

      // ASCII renderer
      const renderer = new ASCIIRenderer(cols, rows);

      // Narrative orchestrator with 2ms stagger for smooth reveal
      const orchestrator = new NarrativeOrchestrator(3, 2);

      // Text mask for "theos.sh" title
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = cols;
      maskCanvas.height = rows;
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.fillStyle = 'white';
      maskCtx.textBaseline = 'middle';
      maskCtx.textAlign = 'center';

      // Scale text to ~65% of grid width
      let fontSize = rows * 0.4;
      maskCtx.font = `bold ${fontSize}px monospace`;
      const naturalWidth = maskCtx.measureText('theos.sh').width;
      if (naturalWidth > cols * 0.65) {
        fontSize *= (cols * 0.65) / naturalWidth;
        maskCtx.font = `bold ${fontSize}px monospace`;
      }

      maskCtx.fillText('theos.sh', cols / 2, rows / 2);

      const pixels = maskCtx.getImageData(0, 0, cols, rows).data;
      const textMask = new Uint8Array(rows * cols);
      for (let i = 0; i < rows * cols; i++) {
        textMask[i] = pixels[i * 4 + 3]! > 64 ? 1 : 0;
      }

      // Generate field of descriptors using seed PRNG
      const prng = new Xoshiro256(new Uint8Array(seed));
      const descriptorCurv: Map<string, number> = new Map();

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const noise = prng.nextFloat();
          const curvature = 1.0 + noise * 0.12; // range [1.0, 1.12]
          descriptorCurv.set(`${col},${row}`, curvature);

          const descriptor: Descriptor = {
            curvature_tensor: [[curvature, 0, 0], [0, curvature * 0.9, 0], [0, 0, 1.0]],
            christoffel_symbols: null,
            topology: { genus: 0, wormhole_pairs: [] },
            content_module_id: 0,
            color_params: { hue_offset: (noise - 0.5) * 0.3, saturation_scale: 0.8 + noise * 0.4 },
            force_field: { direction: [0, 0, 1], magnitude: 0 },
          };

          orchestrator.onModuleEnter([col, row, 0], descriptor);
        }
      }

      // Dimmed accent color for text mask (60% lightness)
      const accentDim = `rgb(${Math.round(scheme.accent.r * 0.6)},${Math.round(scheme.accent.g * 0.6)},${Math.round(scheme.accent.b * 0.6)})`;

      // Map char to color
      const charColor = (char: string): string => {
        if (char === '#') return `rgb(${scheme.accent.r},${scheme.accent.g},${scheme.accent.b})`;
        if (char === '+') return `rgb(${scheme.primary.r},${scheme.primary.g},${scheme.primary.b})`;
        if (char === '*') return `rgb(${scheme.secondary.r},${scheme.secondary.g},${scheme.secondary.b})`;
        return `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;
      };

      // Curvature to char mapping
      const charFromCurvature = (curvature: number): string => {
        return curvature > 1.05 ? '#' : curvature > 1.02 ? '+' : '*';
      };

      // Canvas context
      const ctx = canvasRef.getContext('2d')!;
      const startTime = performance.now();
      let rafId: number;

      function frame() {
        const elapsed = performance.now() - startTime;

        // Process all reveals due by now
        while (orchestrator.pendingReveals.length > 0 && orchestrator.pendingReveals[0]!.delay <= elapsed) {
          const reveal = orchestrator.processNextReveal();
          if (reveal) {
            const col = Math.floor(reveal.coords[0]);
            const row = Math.floor(reveal.coords[1]);
            const char = charFromCurvature(Math.abs(reveal.descriptor.curvature_tensor[0]?.[0] ?? 1));
            renderer.setCell(col, row, char);
          }
        }

        // Continuous animation: modulate curvature based on time + position
        const timePhase = (elapsed / 800) * Math.PI * 2;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const key = `${col},${row}`;
            const baseCurv = descriptorCurv.get(key) ?? 1.0;
            const modulation = 0.03 * Math.sin(timePhase + col * 0.3 + row * 0.5);
            const animatedCurv = baseCurv + modulation;
            const char = charFromCurvature(animatedCurv);
            renderer.setCell(col, row, char);
          }
        }

        // Draw to canvas
        const bgRgb = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;
        ctx.fillStyle = bgRgb;
        ctx.fillRect(0, 0, width, height);
        ctx.font = '14px monospace';

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const char = renderer.getCell(col, row);
            const inText = textMask[row * cols + col] === 1;

            if (inText || char !== ' ') {
              const displayChar = inText ? '#' : char;
              const color = inText ? accentDim : charColor(char);
              ctx.fillStyle = color;
              ctx.fillText(displayChar, col * CELL_W, (row + 1) * CELL_H - 2);
            }
          }
        }

        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);

      onCleanup(() => {
        cancelAnimationFrame(rafId);
      });
    } catch (e) {
      console.error('App error:', e);
    }
  });

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh', margin: 0, padding: 0 }}
    />
  );
}
