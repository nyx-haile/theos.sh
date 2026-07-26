import type { Vec3 } from '../../surface/types';
import type { TunablesShape } from '../../config/tunables';
import type { Ray } from './ray';
import { deriveFloat } from '../../crypto/hash';
import type { TitlePolicy, TitleVariant } from '../../title-policy';
import {
  renderScribe,
  tokenizeScribeText,
  type ScribeInput,
  type ScribeRun,
} from '../../scribe';

const MASK_W = 64;
const MASK_H = 12;
const GLYPH_ROWS = 7;
const GLYPH_COLS = 5;
const CHAR_STRIDE = 6;
const TITLE_TEXT = 'theos.sh';
export const REVEAL_TOTAL_MS = 6000;
const SCRIBE_TITLE_PX_PER_EM = 120;
const SCRIBE_SAMPLE_LIMIT = 4096;
const GEOMETRY_LIMIT = 1_000_000;

export type SignatureTitleRenderer = (input: ScribeInput) => ScribeRun;

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
  variant: TitleVariant;
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

function finite(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= GEOMETRY_LIMIT;
}

/**
 * Validate the whole engine boundary before a single engine-owned coordinate
 * reaches the raycaster. This is intentionally stricter than TypeScript: the
 * signature renderer is optional presentation and the classic mask is safe.
 */
function validScribeRun(run: ScribeRun, expectedTokenIds: ReadonlySet<string>): boolean {
  if (!run || !Number.isInteger(run.sampleCount)
    || run.sampleCount <= 0 || run.sampleCount > SCRIBE_SAMPLE_LIMIT) return false;
  const bounds = run.bounds;
  if (!bounds || !finite(bounds.left) || !finite(bounds.top)
    || !finite(bounds.right) || !finite(bounds.bottom)
    || !finite(bounds.width) || !finite(bounds.height)
    || bounds.width <= 0 || bounds.height <= 0
    || bounds.right < bounds.left || bounds.bottom < bounds.top) return false;

  if (!Array.isArray(run.carets) || run.carets.length !== expectedTokenIds.size + 1) return false;
  let previousCaretX = -Infinity;
  for (const caret of run.carets) {
    if (!finite(caret.x) || !finite(caret.y) || !finite(caret.top) || !finite(caret.bottom)
      || caret.x < previousCaretX || caret.bottom < caret.top) return false;
    previousCaretX = caret.x;
  }

  if (!Array.isArray(run.selectionEnvelopes)
    || run.selectionEnvelopes.length !== expectedTokenIds.size) return false;
  const envelopeIds = new Set<string>();
  for (const envelope of run.selectionEnvelopes) {
    if (!expectedTokenIds.has(envelope.tokenId) || envelopeIds.has(envelope.tokenId)
      || !Array.isArray(envelope.polygon) || envelope.polygon.length < 3) return false;
    envelopeIds.add(envelope.tokenId);
    for (const point of envelope.polygon) if (!finite(point.x) || !finite(point.y)) return false;
  }

  if (!Array.isArray(run.strokes) || run.strokes.length === 0) return false;
  let indexedTriangles = 0;
  for (const stroke of run.strokes) {
    const { mesh } = stroke;
    if (!mesh || !(mesh.positions instanceof Float32Array) || !(mesh.indices instanceof Uint32Array)
      || mesh.positions.length < 6 || mesh.positions.length % 2 !== 0
      || mesh.positions.length > SCRIBE_SAMPLE_LIMIT * 4
      || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0
      || mesh.indices.length > SCRIBE_SAMPLE_LIMIT * 6
      || !Array.isArray(mesh.triangleOwners)
      || mesh.triangleOwners.length !== mesh.indices.length / 3
      || !Array.isArray(mesh.outline) || mesh.outline.length < 3) return false;

    const vertexCount = mesh.positions.length / 2;
    for (const coordinate of mesh.positions) if (!finite(coordinate)) return false;
    for (const index of mesh.indices) if (index >= vertexCount) return false;
    for (const owners of mesh.triangleOwners) {
      if (!Array.isArray(owners) || owners.length === 0
        || owners.some((owner) => !expectedTokenIds.has(owner))) return false;
    }
    for (const point of mesh.outline) if (!finite(point.x) || !finite(point.y)) return false;
    indexedTriangles += mesh.indices.length / 3;
  }
  return indexedTriangles > 0;
}

function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function rasterizeScribeRun(run: ScribeRun): Uint8Array | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of run.strokes) {
    for (let i = 0; i < stroke.mesh.positions.length; i += 2) {
      const x = stroke.mesh.positions[i]!;
      const y = stroke.mesh.positions[i + 1]!;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  if (!finite(sourceWidth) || !finite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const paddingX = 1.5;
  const paddingY = 0.75;
  const availableWidth = MASK_W - paddingX * 2;
  const availableHeight = MASK_H - paddingY * 2;
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  if (!finite(scale) || scale <= 0) return null;
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  const offsetX = (MASK_W - drawnWidth) / 2;
  const offsetY = (MASK_H - drawnHeight) / 2;
  const alpha = new Uint8Array(MASK_W * MASK_H);

  for (const stroke of run.strokes) {
    const { positions, indices } = stroke.mesh;
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i]! * 2;
      const ib = indices[i + 1]! * 2;
      const ic = indices[i + 2]! * 2;
      const ax = offsetX + (positions[ia]! - minX) * scale;
      const ay = offsetY + (positions[ia + 1]! - minY) * scale;
      const bx = offsetX + (positions[ib]! - minX) * scale;
      const by = offsetY + (positions[ib + 1]! - minY) * scale;
      const cx = offsetX + (positions[ic]! - minX) * scale;
      const cy = offsetY + (positions[ic + 1]! - minY) * scale;
      const area = edge(ax, ay, bx, by, cx, cy);
      if (!finite(area) || Math.abs(area) < 1e-8) continue;

      const left = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const right = Math.min(MASK_W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const top = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const bottom = Math.min(MASK_H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          // Four coverage samples keep narrow pen triangles alive at 12 rows.
          let covered = 0;
          for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
            const px = col + sx;
            const py = row + sy;
            const e0 = edge(ax, ay, bx, by, px, py);
            const e1 = edge(bx, by, cx, cy, px, py);
            const e2 = edge(cx, cy, ax, ay, px, py);
            const sameSide = area > 0
              ? e0 >= -1e-7 && e1 >= -1e-7 && e2 >= -1e-7
              : e0 <= 1e-7 && e1 <= 1e-7 && e2 <= 1e-7;
            if (sameSide) covered++;
          }
          if (covered > 0) {
            const index = row * MASK_W + col;
            alpha[index] = 255;
          }
        }
      }
    }
  }

  let coveredCells = 0;
  for (const value of alpha) if (value > 64) coveredCells++;
  return coveredCells >= TITLE_TEXT.length ? alpha : null;
}

function signatureAlpha(seed: Uint8Array, renderer: SignatureTitleRenderer): Uint8Array | null {
  const tokens = tokenizeScribeText(TITLE_TEXT, 'signature-title');
  const expectedTokenIds = new Set(tokens.map((token) => token.id));
  const run = renderer({
    tokens,
    seed,
    pxPerEm: SCRIBE_TITLE_PX_PER_EM,
    maxWidth: SCRIBE_TITLE_PX_PER_EM * 8,
    quality: 'full',
  });
  if (!validScribeRun(run, expectedTokenIds)) return null;
  return rasterizeScribeRun(run);
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

export function createTitleMarker(
  t: TunablesShape,
  seed: Uint8Array = new Uint8Array(32),
  policy?: TitlePolicy,
  signatureRenderer: SignatureTitleRenderer = renderScribe,
): TitleMarker {
  const bold = deriveFloat(seed, 'fontVariation', 'weight') >= 0.5;
  const classicAlpha = rasterizeGlyphs(bold);
  let alpha = classicAlpha;
  let variant: TitleVariant = 'classic';
  if (policy?.variant === 'signature') {
    try {
      const rendered = signatureAlpha(seed, signatureRenderer);
      if (rendered) {
        alpha = rendered;
        variant = 'signature';
      }
    } catch {
      // The classic title is a permanent, byte-pinned safety boundary.
    }
  }
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
    revealTotalMs: policy?.reveal === 'complete' ? 0 : REVEAL_TOTAL_MS,
    variant,
  };
}

export function revealedCount(marker: TitleMarker, elapsedMs: number): number {
  const n = marker.revealOrder.length;
  if (marker.revealTotalMs <= 0) return n;
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
