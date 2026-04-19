import type { Vec3 } from '../../surface/types';
import type { TunablesShape } from '../../config/tunables';
import type { Ray } from './ray';
import { deriveFloat } from '../../crypto/hash';

const MASK_W = 64;
const MASK_H = 12;
const GLYPH_ROWS = 7;
const GLYPH_COLS = 5;
const CHAR_STRIDE = 6;
const TITLE_TEXT = 'theos.sh';
export const REVEAL_TOTAL_MS = 6000;

const GLYPH_BITMAPS: Record<string, readonly string[]> = {
  t: [
    '..#..',
    '..#..',
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '...##',
  ],
  h: [
    '#....',
    '#....',
    '#.##.',
    '##..#',
    '#...#',
    '#...#',
    '#...#',
  ],
  e: [
    '.###.',
    '#...#',
    '#...#',
    '#####',
    '#....',
    '#....',
    '.####',
  ],
  o: [
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '.###.',
  ],
  s: [
    '.####',
    '#....',
    '#....',
    '.###.',
    '....#',
    '....#',
    '####.',
  ],
  '.': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '..#..',
  ],
};

export interface TitleMarker {
  center: Vec3;
  text: string;
  widthWorld: number;
  heightWorld: number;
  maskW: number;
  maskH: number;
  alpha: Uint8Array;
  density: Uint8Array;
  shadowMask: Uint8Array;
  revealOrder: Uint32Array;
  revealStep: Uint32Array;
  revealTotalMs: number;
}

export interface TitleHit {
  distance: number;
  kind: 'face' | 'shadow';
  density: number;
  maskIdx: number;
}

function rasterizeGlyphs(bold: boolean): Uint8Array {
  const alpha = new Uint8Array(MASK_W * MASK_H);
  const totalWidth = TITLE_TEXT.length * CHAR_STRIDE - 1;
  const leftPad = Math.max(0, Math.floor((MASK_W - totalWidth) / 2));
  const topPad = Math.floor((MASK_H - GLYPH_ROWS) / 2);
  for (let i = 0; i < TITLE_TEXT.length; i++) {
    const ch = TITLE_TEXT[i]!;
    const bmp = GLYPH_BITMAPS[ch];
    if (!bmp) continue;
    const col0 = leftPad + i * CHAR_STRIDE;
    for (let py = 0; py < GLYPH_ROWS; py++) {
      const row = bmp[py]!;
      for (let px = 0; px < GLYPH_COLS; px++) {
        if (row[px] !== '#') continue;
        const mr = topPad + py;
        const mc = col0 + px;
        if (mr < 0 || mr >= MASK_H || mc < 0 || mc >= MASK_W) continue;
        alpha[mr * MASK_W + mc] = 255;
        if (bold) {
          const mc2 = mc + 1;
          if (mc2 < MASK_W) alpha[mr * MASK_W + mc2] = 255;
        }
      }
    }
  }
  return alpha;
}

function buildDensity(alpha: Uint8Array): Uint8Array {
  const density = new Uint8Array(MASK_W * MASK_H);
  for (let r = 0; r < MASK_H; r++) {
    for (let c = 0; c < MASK_W; c++) {
      if (alpha[r * MASK_W + c]! <= 64) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= MASK_H || cc < 0 || cc >= MASK_W) continue;
          if (alpha[rr * MASK_W + cc]! > 64) n++;
        }
      }
      density[r * MASK_W + c] = n;
    }
  }
  return density;
}

function buildShadow(alpha: Uint8Array, angle: number): Uint8Array {
  const shadow = new Uint8Array(MASK_W * MASK_H);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const maxDist = Math.max(MASK_W, MASK_H);
  for (let r = 0; r < MASK_H; r++) {
    for (let c = 0; c < MASK_W; c++) {
      if (alpha[r * MASK_W + c]! <= 64) continue;
      for (let d = 1; d <= maxDist; d++) {
        const sr = Math.round(r + dy * d);
        const sc = Math.round(c + dx * d);
        if (sr < 0 || sr >= MASK_H || sc < 0 || sc >= MASK_W) break;
        const idx = sr * MASK_W + sc;
        if (alpha[idx]! > 64) break;
        shadow[idx] = 1;
      }
    }
  }
  return shadow;
}

function hash32(seed: Uint8Array, label: string): number {
  const v = deriveFloat(seed, label);
  return Math.floor(v * 0x100000000) >>> 0;
}

function buildRevealOrder(alpha: Uint8Array, shadow: Uint8Array, seed: Uint8Array): Uint32Array {
  const colHash = new Uint32Array(MASK_W);
  const rowHash = new Uint32Array(MASK_H);
  for (let c = 0; c < MASK_W; c++) colHash[c] = hash32(seed, `reveal:col:${c}`);
  for (let r = 0; r < MASK_H; r++) rowHash[r] = hash32(seed, `reveal:row:${r}`);
  const pairs: Array<[number, number]> = [];
  for (let r = 0; r < MASK_H; r++) {
    for (let c = 0; c < MASK_W; c++) {
      const idx = r * MASK_W + c;
      const isFace = alpha[idx]! > 64;
      const isShadow = shadow[idx] === 1;
      if (!isFace && !isShadow) continue;
      const key = (colHash[c]! ^ rowHash[r]!) >>> 0;
      pairs.push([key, idx]);
    }
  }
  pairs.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const order = new Uint32Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) order[i] = pairs[i]![1];
  return order;
}

export function createTitleMarker(t: TunablesShape, seed: Uint8Array = new Uint8Array(32)): TitleMarker {
  const bold = deriveFloat(seed, 'fontVariation', 'weight') >= 0.5;
  const alpha = rasterizeGlyphs(bold);
  const density = buildDensity(alpha);
  const angle = deriveFloat(seed, 'shadow3D', 'angle') * Math.PI * 2;
  const shadowMask = buildShadow(alpha, angle);
  const revealOrder = buildRevealOrder(alpha, shadowMask, seed);
  const revealStep = new Uint32Array(MASK_W * MASK_H);
  for (let k = 0; k < revealOrder.length; k++) revealStep[revealOrder[k]!] = k + 1;
  const heightWorld = t.manifold.minorRadius * 1.1;
  const widthWorld = heightWorld * (MASK_W / MASK_H);
  return {
    center: [0, 0, 0],
    text: TITLE_TEXT,
    widthWorld,
    heightWorld,
    maskW: MASK_W,
    maskH: MASK_H,
    alpha,
    density,
    shadowMask,
    revealOrder,
    revealStep,
    revealTotalMs: REVEAL_TOTAL_MS,
  };
}

export function revealedCount(marker: TitleMarker, elapsedMs: number): number {
  const n = marker.revealOrder.length;
  const tNorm = Math.min(1, Math.max(0, elapsedMs / marker.revealTotalMs));
  const eased = Math.pow(tNorm, 1.5);
  return Math.min(n, Math.round(n * eased));
}

export function intersectTitle(
  ray: Ray,
  marker: TitleMarker,
  playerPos: Vec3,
  elapsedMs: number = 0,
): TitleHit | null {
  const cx = marker.center[0], cy = marker.center[1], cz = marker.center[2];
  let nx = playerPos[0] - cx, ny = playerPos[1] - cy, nz = playerPos[2] - cz;
  const nmag = Math.sqrt(nx*nx + ny*ny + nz*nz);
  if (nmag < 1e-6) return null;
  nx /= nmag; ny /= nmag; nz /= nmag;

  const denom = ray.direction[0]*nx + ray.direction[1]*ny + ray.direction[2]*nz;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((cx - ray.origin[0])*nx + (cy - ray.origin[1])*ny + (cz - ray.origin[2])*nz) / denom;
  if (t <= 0) return null;

  const px = ray.origin[0] + ray.direction[0]*t;
  const py = ray.origin[1] + ray.direction[1]*t;
  const pz = ray.origin[2] + ray.direction[2]*t;

  let rx = -ny, ry = nx, rz = 0;
  let rmag = Math.sqrt(rx*rx + ry*ry + rz*rz);
  if (rmag < 1e-6) { rx = 1; ry = 0; rz = 0; rmag = 1; }
  rx /= rmag; ry /= rmag; rz /= rmag;
  const ux = ny*rz - nz*ry;
  const uy = nz*rx - nx*rz;
  const uz = nx*ry - ny*rx;

  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const localU = dx*rx + dy*ry + dz*rz;
  const localV = dx*ux + dy*uy + dz*uz;

  const halfW = marker.widthWorld * 0.5;
  const halfH = marker.heightWorld * 0.5;
  if (localU < -halfW || localU > halfW) return null;
  if (localV < -halfH || localV > halfH) return null;

  const mc = Math.max(0, Math.min(marker.maskW - 1,
    Math.floor((localU + halfW) / marker.widthWorld * marker.maskW)));
  const mr = Math.max(0, Math.min(marker.maskH - 1,
    Math.floor((halfH - localV) / marker.heightWorld * marker.maskH)));
  const idx = mr * marker.maskW + mc;

  const step = marker.revealStep[idx]!;
  if (step === 0) return null;
  if (step > revealedCount(marker, elapsedMs)) return null;

  if (marker.alpha[idx]! > 64) {
    return { distance: t, kind: 'face', density: marker.density[idx]!, maskIdx: idx };
  }
  if (marker.shadowMask[idx] === 1) {
    return { distance: t, kind: 'shadow', density: 0, maskIdx: idx };
  }
  return null;
}
