import { onMount, onCleanup } from 'solid-js';
import * as THREE from 'three';
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

      const gates = evalGates(seed);

      // --- Generate descriptor curvature field ---
      const prng = new Xoshiro256(new Uint8Array(seed));
      const descriptorCurv: Map<string, number> = new Map();
      const colorParamsMap: Map<string, { hueOffset: number; satScale: number }> = new Map();

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const noise = prng.nextFloat();
          const curvature = 1.0 + noise * 0.12;
          descriptorCurv.set(`${col},${row}`, curvature);

          const hueOffset = (noise - 0.5) * 0.3;
          const satScale = 0.8 + noise * 0.4;
          colorParamsMap.set(`${col},${row}`, { hueOffset, satScale });

          const descriptor: Descriptor = {
            curvature_tensor: [[curvature, 0, 0], [0, curvature * 0.9, 0], [0, 0, 1.0]],
            christoffel_symbols: null,
            topology: { genus: 0, wormhole_pairs: [] },
            content_module_id: 0,
            color_params: { hue_offset: hueOffset, saturation_scale: satScale },
            force_field: { direction: [0, 0, 1], magnitude: 0 },
          };
        }
      }

      // --- Generate text mask with 3D layers ---
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

      const rawFacePixels   = drawMaskCanvas(0, 0);
      const shadowPixels    = gates.shadow3D.active
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

      const textCellIndices: number[] = [];
      for (let i = 0; i < rows * cols; i++) {
        if ((layerMask[i] ?? 0) > 0) textCellIndices.push(i);
      }
      const cx2 = cols / 2, cy2 = rows / 2;
      textCellIndices.sort((a, b) => {
        const ar = Math.floor(a / cols), ac = a % cols;
        const br = Math.floor(b / cols), bc = b % cols;
        return ((ac-cx2)**2+(ar-cy2)**2) - ((bc-cx2)**2+(br-cy2)**2);
      });
      const revealTime = new Float32Array(rows * cols).fill(Infinity);
      textCellIndices.forEach((ci, k) => {
        revealTime[ci] = (k / textCellIndices.length) * DECRYPT_DURATION;
      });

      // --- Three.js scene setup ---
      const threeCanvas = document.createElement('canvas');
      threeCanvas.width  = cols;
      threeCanvas.height = rows;
      const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: false, alpha: false });
      renderer.setSize(cols, rows, false);
      renderer.setClearColor(0x000000, 1);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, cols / rows, 0.1, 100);

      if (gates.cameraAngle.active) {
        const tilt = gates.cameraAngle.tilt;
        const az   = gates.cameraAngle.azimuth;
        const dist = 3;
        camera.position.set(
          Math.sin(az) * Math.sin(tilt) * dist,
          -Math.cos(az) * Math.sin(tilt) * dist,
          Math.cos(tilt) * dist,
        );
      } else {
        camera.position.set(0, 0, 3);
      }
      camera.lookAt(0, 0, 0);

      const dirLight = new THREE.DirectionalLight(0xffffff, gates.shadow3D.active ? 1.2 : 0.6);
      if (gates.shadow3D.active) {
        const a = gates.shadow3D.angle;
        dirLight.position.set(Math.cos(a) * 3, Math.sin(a) * 3, 2);
      } else {
        dirLight.position.set(1, 1, 2);
      }
      scene.add(dirLight);
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));

      // --- Manifold geometry ---
      const geo = new THREE.PlaneGeometry(2, 2, cols - 1, rows - 1);
      const positions = geo.attributes['position']!.array as Float32Array;

      const curvArr  = new Float32Array(cols * rows);
      const layerArr = new Float32Array(cols * rows);
      const baseXArr = new Float32Array(cols * rows);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const vIdx = (rows - 1 - row) * cols + col;
          curvArr[vIdx]  = descriptorCurv.get(`${col},${row}`) ?? 1.0;
          layerArr[vIdx] = layerMask[row * cols + col] ?? 0;
          baseXArr[vIdx] = positions[vIdx * 3 + 0] ?? 0;
        }
      }

      for (let v = 0; v < cols * rows; v++) {
        const layer = layerArr[v]!;
        positions[v * 3 + 2] = (curvArr[v]! - 1.0) * 5.0
          + (layer === 3 ? 0.45 : layer === 1 ? 0.2 : 0.0);
      }
      geo.attributes['position']!.needsUpdate = true;
      geo.computeVertexNormals();

      if (gates.mirrorFlip.active) {
        const axis = gates.mirrorFlip.axis === 'h' ? 0 : 1;
        for (let v = 0; v < cols * rows; v++) {
          baseXArr[v] = axis === 0 ? -baseXArr[v]! : baseXArr[v]!;
          positions[v * 3 + axis] = (positions[v * 3 + axis] ?? 0) * -1;
        }
        geo.attributes['position']!.needsUpdate = true;
        geo.computeVertexNormals();
      }

      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(scheme.primary.r / 255, scheme.primary.g / 255, scheme.primary.b / 255),
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      // --- Color helpers for text cells ---
      const aR = scheme.accent.r, aG = scheme.accent.g, aB = scheme.accent.b;
      const colorForLayer = (layer: number, density: number): string => {
        const scale = layer === 3 ? 0.55 + density * 0.09 : 0.28;
        return `rgb(${Math.round(aR*scale)},${Math.round(aG*scale)},${Math.round(aB*scale)})`;
      };
      const colorScramble = `rgb(${Math.round(aR*0.22)},${Math.round(aG*0.22)},${Math.round(aB*0.22)})`;
      const colorGlitch   = `rgb(${Math.min(255,Math.round(aR*1.5))},${Math.min(255,Math.round(aG*1.5))},${Math.min(255,Math.round(aB*1.5))})`;

      // --- Frame loop ---
      const pixelBuffer = new Uint8Array(cols * rows * 4);
      const ctx = canvasRef.getContext('2d')!;
      const weight = gates.fontVariation.active ? gates.fontVariation.weight : 'bold';
      const sizeAdjust = gates.fontVariation.active ? 1 + gates.fontVariation.sizeVar : 1;
      ctx.font = `${weight} ${Math.round(14 * sizeAdjust)}px monospace`;
      let rafId: number;
      const startTime = performance.now();

      const jitterSeeds = new Float32Array(rows);
      for (let r = 0; r < rows; r++) jitterSeeds[r] = gateHash(seed, `jitter:row:${r}`);

      function frame() {
        const elapsed = performance.now() - startTime;
        const timePhase = (elapsed / 800) * Math.PI * 2;

        // Update vertex positions
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const vIdx  = (rows - 1 - row) * cols + col;
            const idx   = row * cols + col;
            const curv  = curvArr[vIdx]!;
            const layer = layerArr[vIdx]!;

            const wave    = 0.03 * Math.sin(timePhase + col * 0.3 + row * 0.5);
            let zDisp = (curv + wave - 1.0) * 5.0;

            if (layer > 0) {
              const revealed = elapsed >= revealTime[idx]!;
              const revealProgress = revealed
                ? Math.min(1, (elapsed - revealTime[idx]!) / 200)
                : 0;
              const textZ = (layer === 3 ? 0.45 : 0.2) * revealProgress;
              zDisp += textZ;

              if (gates.textDistortion.active) {
                const xShift = gates.textDistortion.amplitude
                  * Math.sin(row * gates.textDistortion.freq * Math.PI * 2);
                positions[vIdx * 3] = baseXArr[vIdx]! + xShift;
              }

              if (gates.jitter.active && !revealed) {
                const jb = jitterSeeds[row]!;
                if (jb < 0.12) {
                  const current = positions[vIdx * 3] ?? 0;
                  positions[vIdx * 3] = current + (jb < 0.06 ? 1 : -1) * gates.jitter.amplitude;
                }
              }
            }

            positions[vIdx * 3 + 2] = zDisp;
          }
        }
        mesh.geometry.attributes['position']!.needsUpdate = true;
        mesh.geometry.computeVertexNormals();

        // Render 3D scene
        renderer.render(scene, camera);
        const glCtx = threeCanvas.getContext('webgl2') ?? threeCanvas.getContext('webgl')!;
        (glCtx as WebGLRenderingContext).readPixels(
          0, 0, cols, rows,
          (glCtx as WebGLRenderingContext).RGBA,
          (glCtx as WebGLRenderingContext).UNSIGNED_BYTE,
          pixelBuffer,
        );

        // ASCII map
        const bgRgb = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;
        ctx.fillStyle = bgRgb;
        ctx.fillRect(0, 0, width, height);

        for (let row = 0; row < rows; row++) {
          const srcRow = rows - 1 - row;
          for (let col = 0; col < cols; col++) {
            const pOff   = (srcRow * cols + col) * 4;
            const r = pixelBuffer[pOff]!;
            const g = pixelBuffer[pOff + 1]!;
            const b = pixelBuffer[pOff + 2]!;
            const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

            const idx   = row * cols + col;
            const layer = layerMask[idx] ?? 0;

            if (layer === 0) {
              if (lum < 0.015) continue;
              const ci = Math.min(4, Math.floor(lum * 5));
              // Apply color variation from color_params
              const colorParams = colorParamsMap.get(`${col},${row}`);
              const satScale = colorParams?.satScale ?? 1.0;
              const rVar = Math.min(255, Math.round(r * (0.8 + satScale * 0.25)));
              const gVar = Math.min(255, Math.round(g * (0.8 + satScale * 0.25)));
              const bVar = Math.min(255, Math.round(b * (0.8 + satScale * 0.25)));
              ctx.fillStyle = `rgb(${rVar},${gVar},${bVar})`;
              ctx.fillText(DENSE_CHARS[ci]!, col * CELL_W, (row + 1) * CELL_H - 2);
            } else {
              const revealed = elapsed >= revealTime[idx]!;

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
                const lumDriven = Math.min(4, Math.max(0, Math.round(lum * 6 - 0.5)));
                const d = layer === 3
                  ? Math.round((lumDriven + density) / 2)
                  : Math.max(0, lumDriven - 1);
                ctx.fillStyle = colorForLayer(layer, density as number);
                ctx.fillText(DENSE_CHARS[Math.min(4, d)]!, col * CELL_W, (row + 1) * CELL_H - 2);
              }
            }
          }
        }

        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);

      onCleanup(() => {
        cancelAnimationFrame(rafId);
        renderer.dispose();
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
