import { onMount, onCleanup } from 'solid-js';
import { runOriginPhase } from './origin/anchor';
import { generateColorScheme } from './rendering/color-scheme';
import { Xoshiro256 } from './manifold/prng';
import type { Descriptor } from './manifold/types';

const CELL_W = 9;   // px per character (monospace)
const CELL_H = 16;  // px per line height

// --- Gate infrastructure ---

function gateHash(seed: Uint8Array, name: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 33) ^ seed[i]!) >>> 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 33) ^ name.charCodeAt(i)) >>> 0;
  return h / 0x100000000;
}

function gateParam(seed: Uint8Array, name: string, sub: string): number {
  return gateHash(seed, name + ':' + sub);
}

interface Gates {
  shadow3D:       { active: boolean; angle: number; depth: number };
  cellGlitch:     { active: boolean };
  textDistortion: { active: boolean; amplitude: number; freq: number };
  jitter:         { active: boolean; amplitude: number };
  mirrorFlip:     { active: boolean; axis: 'h' | 'v' };
  cameraAngle:    { active: boolean; tilt: number; azimuth: number };
  manifoldGenus:  { active: boolean; genus: number };
  fontVariation:  { active: boolean; weight: 'normal' | 'bold'; sizeVar: number };
}

function evalGates(seed: Uint8Array): Gates {
  const p = (name: string, sub: string) => gateParam(seed, name, sub);
  return {
    shadow3D: {
      active: gateHash(seed, 'shadow3D') < 0.75,
      angle:  p('shadow3D', 'angle') * Math.PI * 2,
      depth:  2 + Math.round(p('shadow3D', 'depth') * 3),
    },
    cellGlitch: {
      active: gateHash(seed, 'cellGlitch') < 0.50,
    },
    textDistortion: {
      active:    gateHash(seed, 'textDistortion') < 0.40,
      amplitude: 0.15 + p('textDistortion', 'amp') * 0.25,
      freq:      0.05 + p('textDistortion', 'freq') * 0.15,
    },
    jitter: {
      active:    gateHash(seed, 'jitter') < 0.35,
      amplitude: 0.1 + p('jitter', 'amp') * 0.2,
    },
    mirrorFlip: {
      active: gateHash(seed, 'mirrorFlip') < 0.25,
      axis:   p('mirrorFlip', 'axis') < 0.5 ? 'h' : 'v',
    },
    cameraAngle: {
      active:  gateHash(seed, 'cameraAngle') < 0.60,
      tilt:    0.15 + p('cameraAngle', 'tilt') * 0.35,
      azimuth: p('cameraAngle', 'az') * Math.PI * 2,
    },
    manifoldGenus: {
      active: gateHash(seed, 'manifoldGenus') < 0.30,
      genus:  1 + Math.floor(p('manifoldGenus', 'count') * 3),
    },
    fontVariation: {
      active:  gateHash(seed, 'fontVariation') < 0.50,
      weight:  p('fontVariation', 'weight') < 0.5 ? 'normal' : 'bold',
      sizeVar: (p('fontVariation', 'size') - 0.5) * 0.3,
    },
  };
}

const DENSE_CHARS = ['.', ':', '+', '%', '#'] as const;
const GIBBERISH   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@$^&*<>?/' as const;
const DECRYPT_DURATION = 2800;
const GLITCH_GRACE     = 3500;

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;

  onMount(() => {
    if (!canvasRef) return;

    try {
      const { seed, tier: _tier } = runOriginPhase();
      const scheme = generateColorScheme(seed);

      const width = window.innerWidth;
      const height = window.innerHeight;
      const cols = Math.floor(width / CELL_W);
      const rows = Math.floor(height / CELL_H);
      canvasRef.width  = width;
      canvasRef.height = height;

      const gates = evalGates(seed);

      // Sync body background to scheme so no gap shows below canvas
      document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

      // --- Curvature + color fields ---
      const prng = new Xoshiro256(new Uint8Array(seed));
      const curvField  = new Float32Array(rows * cols);
      const satField   = new Float32Array(rows * cols);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const noise = prng.nextFloat();
          const idx = row * cols + col;
          curvField[idx] = 1.0 + noise * 0.12;
          satField[idx]  = 0.8 + noise * 0.4;

          const curvature = curvField[idx]!;
          const _descriptor: Descriptor = {
            curvature_tensor: [[curvature, 0, 0], [0, curvature * 0.9, 0], [0, 0, 1.0]],
            christoffel_symbols: null,
            topology: { genus: 0, wormhole_pairs: [] },
            content_module_id: 0,
            color_params: { hue_offset: (noise - 0.5) * 0.3, saturation_scale: satField[idx]! },
            force_field: { direction: [0, 0, 1], magnitude: 0 },
          };
        }
      }

      // --- Text mask ---
      function drawMaskCanvas(offsetX: number, offsetY: number): Uint8ClampedArray {
        const c = document.createElement('canvas');
        c.width = cols; c.height = rows;
        const cx = c.getContext('2d')!;
        cx.fillStyle = 'white';
        cx.textBaseline = 'middle';
        cx.textAlign = 'center';
        let fs = rows * 0.4;
        const weight = gates.fontVariation.active ? gates.fontVariation.weight : 'bold';
        cx.font = `${weight} ${fs}px monospace`;
        const nw = cx.measureText('theos.sh').width;
        if (nw > cols * 0.65) { fs *= (cols * 0.65) / nw; cx.font = `${weight} ${fs}px monospace`; }
        cx.fillText('theos.sh', cols / 2 + offsetX, rows / 2 + offsetY);
        return cx.getImageData(0, 0, cols, rows).data;
      }

      const rawFacePixels = drawMaskCanvas(0, 0);
      const shadowPixels  = gates.shadow3D.active
        ? drawMaskCanvas(
            Math.round(Math.cos(gates.shadow3D.angle) * gates.shadow3D.depth),
            Math.round(Math.sin(gates.shadow3D.angle) * gates.shadow3D.depth),
          )
        : null;

      function sampleFacePixelAlpha(col: number, row: number): number {
        if (!gates.textDistortion.active) return rawFacePixels[row * cols * 4 + col * 4 + 3]!;
        const dx = Math.round(gates.textDistortion.amplitude * Math.sin(row * gates.textDistortion.freq * Math.PI * 2));
        const sc = Math.max(0, Math.min(cols - 1, col - dx));
        return rawFacePixels[row * cols * 4 + sc * 4 + 3]!;
      }

      const layerMask = new Uint8Array(rows * cols);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const inFace   = sampleFacePixelAlpha(col, row) > 64;
          const inShadow = shadowPixels ? shadowPixels[i * 4 + 3]! > 64 : false;
          if      (inFace)   layerMask[i] = 3;
          else if (inShadow) layerMask[i] = 1;
        }
      }

      // Dither density for text cells
      const textDensity = new Uint8Array(rows * cols);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          if (layerMask[idx] !== 3) continue;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && layerMask[nr * cols + nc] === 3) n++;
          }
          textDensity[idx] = Math.min(4, Math.floor(n / 2));
        }
      }

      // Reveal order: hash col and row independently, combine with XOR
      let totalTextCells = 0;
      const cellRevealOrder: Map<number, number> = new Map();
      for (let i = 0; i < rows * cols; i++) {
        if ((layerMask[i] ?? 0) > 0) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          let hCol = 5381;
          for (let j = 0; j < seed.length; j++) hCol = (Math.imul(hCol, 33) ^ seed[j]!) >>> 0;
          hCol = (Math.imul(hCol, 65599) ^ col) >>> 0;
          let hRow = 5381;
          for (let j = 0; j < seed.length; j++) hRow = (Math.imul(hRow, 33) ^ seed[j]!) >>> 0;
          hRow = (Math.imul(hRow, 65599) ^ row) >>> 0;
          cellRevealOrder.set(i, (hCol ^ hRow) >>> 0);
          totalTextCells++;
        }
      }
      const textCellIndices = Array.from(cellRevealOrder.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([idx]) => idx);

      // --- Color helpers ---
      const pR = scheme.primary.r,   pG = scheme.primary.g,   pB = scheme.primary.b;
      const sR = scheme.secondary.r, sG = scheme.secondary.g, sB = scheme.secondary.b;
      const aR = scheme.accent.r,    aG = scheme.accent.g,    aB = scheme.accent.b;

      // Background: interpolate primary→accent by curvature level, modulated by satField
      function bgColor(col: number, row: number, ci: number): string {
        const sat = satField[row * cols + col] ?? 1.0;
        const t = ci / 4;  // 0=sparse→primary, 1=dense→accent
        const r = Math.round((pR + (aR - pR) * t) * sat);
        const g = Math.round((pG + (aG - pG) * t) * sat);
        const b = Math.round((pB + (aB - pB) * t) * sat);
        return `rgb(${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,b)})`;
      }

      // Text at high brightness using secondary hue — push well above background lightness
      const colorForLayer = (layer: number, density: number): string => {
        if (layer === 3) {
          // Face: boost secondary to near-white, inner pixels (density=4) brightest
          const scale = 1.8 + density * 0.12;
          return `rgb(${Math.min(255,Math.round(sR*scale))},${Math.min(255,Math.round(sG*scale))},${Math.min(255,Math.round(sB*scale))})`;
        }
        // Shadow: dim secondary
        return `rgb(${Math.round(sR*0.5)},${Math.round(sG*0.5)},${Math.round(sB*0.5)})`;
      };
      const colorScramble = `rgb(${Math.round(sR*0.4)},${Math.round(sG*0.4)},${Math.round(sB*0.4)})`;
      const colorGlitch   = `rgb(${Math.min(255,Math.round(sR*2.5))},${Math.min(255,Math.round(sG*2.5))},${Math.min(255,Math.round(sB*2.5))})`;

      // --- Frame loop ---
      const ctx = canvasRef.getContext('2d')!;
      const weight = gates.fontVariation.active ? gates.fontVariation.weight : 'bold';
      const sizeAdjust = gates.fontVariation.active ? 1 + gates.fontVariation.sizeVar : 1;
      ctx.font = `${weight} ${Math.round(22 * sizeAdjust)}px monospace`;
      let rafId: number;
      const startTime = performance.now();

      function frame() {
        const elapsed = performance.now() - startTime;
        const timePhase = (elapsed / 800) * Math.PI * 2;

        const revealElapsed = Math.max(0, elapsed - DECRYPT_DURATION);
        const numRevealed = Math.min(totalTextCells, Math.floor(Math.sqrt(revealElapsed) * 3));
        const revealedCellSet = new Set(textCellIndices.slice(0, numRevealed));

        const bgRgb = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;
        ctx.fillStyle = bgRgb;
        ctx.fillRect(0, 0, width, height);

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const idx   = row * cols + col;
            const layer = layerMask[idx] ?? 0;

            if (layer === 0) {
              // Background: curvature noise + gentle wave → char density
              const curv = curvField[idx]!;
              const wave = 0.015 * Math.sin(timePhase + col * 0.15 + row * 0.22);
              const animCurv = curv + wave;
              // Three bands matching original approach, noise-dominant
              const ci = animCurv > 1.07 ? 4 : animCurv > 1.04 ? 2 : 1;
              ctx.fillStyle = bgColor(col, row, ci);
              ctx.fillText(DENSE_CHARS[ci]!, col * CELL_W, (row + 1) * CELL_H - 2);
            } else {
              // Text cells: drawn directly, no Three.js
              const revealed = revealedCellSet.has(idx);

              let glitching = false;
              if (gates.cellGlitch.active && revealed && elapsed > GLITCH_GRACE) {
                const gPeriod   = 3000 + gateParam(seed, `cellGlitch:${idx}`, 'period') * 12000;
                const gPhase    = gateParam(seed, `cellGlitch:${idx}`, 'phase') * gPeriod;
                const gDuration = 60 + gateParam(seed, `cellGlitch:${idx}`, 'dur') * 120;
                glitching = (elapsed + gPhase) % gPeriod < gDuration;
              }

              if (!revealed || glitching) {
                const gIdx = Math.floor((elapsed / 55 + idx * 13.7)) % GIBBERISH.length;
                ctx.fillStyle = glitching ? colorGlitch : colorScramble;
                ctx.fillText(GIBBERISH[gIdx]!, col * CELL_W, (row + 1) * CELL_H - 2);
              } else {
                const density = textDensity[idx] ?? 0;
                ctx.fillStyle = colorForLayer(layer, density);
                ctx.fillText(DENSE_CHARS[density]!, col * CELL_W, (row + 1) * CELL_H - 2);
              }
            }
          }
        }

        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);

      onCleanup(() => cancelAnimationFrame(rafId));
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
