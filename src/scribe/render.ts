import { opticalParameters } from './optics';
import {
  isSupportedScribeGrapheme,
  MISSING_SCRIBE_GESTURE,
  SCRIBE_GESTURES,
  type AuthoredGesture,
  type AuthoredStroke,
  type CubicSegment,
} from './repertoire';
import type {
  CaretSlot,
  PenPoint,
  PenStroke,
  Rect,
  ScribeInput,
  ScribeRun,
  ScribeToken,
  SelectionEnvelope,
  StrokeMesh,
  Vec2,
} from './types';

export const MAX_SCRIBE_TOKENS = 64;
export const MAX_SCRIBE_SAMPLES = 4096;

const LOOKAHEAD_HEIGHT: Readonly<Record<string, number>> = {
  e: -0.025,
  h: 0.006,
  l: 0.012,
  o: -0.018,
  s: -0.005,
  t: 0.008,
};

interface MotorTarget extends Vec2 {
  owners: readonly string[];
  pressureTarget: number;
}

interface TargetStroke {
  id: string;
  targets: MotorTarget[];
}

interface GestureVariation {
  width: number;
  height: number;
  slant: number;
  baseline: number;
  tremorPhase: number;
  repetition: number;
  lookaheadY: number;
}

const emptyRect = (): Rect => ({
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
});

function rectFromEdges(left: number, top: number, right: number, bottom: number): Rect {
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function rectFromPoints(points: readonly Vec2[]): Rect {
  if (points.length === 0) return emptyRect();
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return rectFromEdges(left, top, right, bottom);
}

function unionRects(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return emptyRect();
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return rectFromEdges(left, top, right, bottom);
}

function stableUnit(seed: Uint8Array, label: string): number {
  let hash = 0x811c9dc5;
  for (const byte of seed) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function cubicPoint(start: Vec2, segment: CubicSegment, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * start.x
      + 3 * uu * t * segment.control1.x
      + 3 * u * tt * segment.control2.x
      + tt * t * segment.to.x,
    y: uu * u * start.y
      + 3 * uu * t * segment.control1.y
      + 3 * u * tt * segment.control2.y
      + tt * t * segment.to.y,
  };
}

function variationFor(
  seed: Uint8Array,
  token: ScribeToken,
  repetition: number,
  nextGrapheme: string | undefined,
): GestureVariation {
  const key = `${token.id}:${token.grapheme}`;
  const repeated = Math.min(repetition, 3);
  return {
    width: 0.975 + stableUnit(seed, `${key}:width`) * 0.055 - repeated * 0.026,
    height: 0.98 + stableUnit(seed, `${key}:height`) * 0.055
      + (token.grapheme === 'l' || token.grapheme === 'h' ? repeated * 0.025 : 0),
    slant: -0.025 + stableUnit(seed, `${key}:slant`) * 0.075 + repeated * 0.012,
    baseline: (stableUnit(seed, `${key}:baseline`) - 0.5) * 0.018,
    tremorPhase: stableUnit(seed, `${key}:phase`) * Math.PI * 2,
    repetition: repeated,
    lookaheadY: nextGrapheme && isSupportedScribeGrapheme(nextGrapheme)
      ? (LOOKAHEAD_HEIGHT[nextGrapheme] ?? 0)
      : 0,
  };
}

function transformGesturePoint(
  point: Vec2,
  originX: number,
  advance: number,
  variation: GestureVariation,
  loopDetail: number,
  counterOpen: number,
): Vec2 {
  const ascenderScale = 0.86 + loopDetail * 0.14;
  const y = point.y * variation.height * ascenderScale + variation.baseline;
  const centeredX = point.x - advance * 0.42;
  const openDirection = centeredX < 0 ? -1 : 1;
  const open = Math.abs(point.y) < 0.62 ? counterOpen * openDirection * 0.14 : 0;
  const repeatedMotion = variation.repetition > 0
    ? Math.sin(point.x * Math.PI * 2 + variation.tremorPhase) * 0.004 * variation.repetition
    : 0;
  const exitProgress = Math.max(0, Math.min(1, (point.x - advance * 0.42) / (advance * 0.5)));
  return {
    x: originX
      + point.x * variation.width
      + (-y) * variation.slant
      + open
      + repeatedMotion,
    y: y + variation.lookaheadY * exitProgress * exitProgress,
  };
}

function sampleAuthoredStroke(
  stroke: AuthoredStroke,
  token: ScribeToken,
  gesture: AuthoredGesture,
  originX: number,
  variation: GestureVariation,
  fixedStep: number,
  samplingDensity: number,
  loopDetail: number,
  counterOpen: number,
): MotorTarget[] {
  const totalDuration = stroke.segments.reduce((sum, segment) => sum + segment.duration, 0);
  let elapsed = 0;
  let start = stroke.start;
  const first = transformGesturePoint(
    start,
    originX,
    gesture.advance,
    variation,
    loopDetail,
    counterOpen,
  );
  const targets: MotorTarget[] = [{
    ...first,
    owners: [token.id],
    pressureTarget: 0,
  }];

  for (const segment of stroke.segments) {
    const durationScale = 0.82 + loopDetail * 0.18;
    const steps = Math.max(
      2,
      Math.ceil(((segment.duration * durationScale) / fixedStep) * samplingDensity),
    );
    for (let step = 1; step <= steps; step++) {
      const local = step / steps;
      const progress = Math.min(1, (elapsed + segment.duration * local) / totalDuration);
      const authored = cubicPoint(start, segment, local);
      const transformed = transformGesturePoint(
        authored,
        originX,
        gesture.advance,
        variation,
        loopDetail,
        counterOpen,
      );
      targets.push({
        ...transformed,
        owners: [token.id],
        pressureTarget: Math.pow(Math.sin(Math.PI * progress), 0.42),
      });
    }
    elapsed += segment.duration;
    start = segment.to;
  }
  return targets;
}

function mergeOwners(...ownerLists: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(ownerLists.flat())];
}

function connectorTargets(
  from: MotorTarget,
  to: MotorTarget,
  fixedStep: number,
  samplingDensity: number,
): MotorTarget[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(
    2,
    Math.ceil((distance / (2.2 * fixedStep)) * samplingDensity),
  );
  const owners = mergeOwners(from.owners, to.owners);
  const targets: MotorTarget[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    targets.push({
      x: from.x + dx * t,
      y: from.y + dy * t - Math.sin(t * Math.PI) * Math.min(0.025, distance * 0.14),
      owners,
      pressureTarget: 0.42 + Math.sin(t * Math.PI) * 0.22,
    });
  }
  return targets;
}

function buildTargets(
  input: ScribeInput,
  fixedStep: number,
  samplingDensity: number,
  loopDetail: number,
  counterOpen: number,
): { strokes: TargetStroke[]; advances: number[]; totalAdvance: number } {
  const strokes: TargetStroke[] = [];
  const advances = [0];
  let originX = 0;
  let activeMain: TargetStroke | undefined;
  let previousGrapheme = '';
  let repetition = 0;

  for (let tokenIndex = 0; tokenIndex < input.tokens.length; tokenIndex++) {
    const token = input.tokens[tokenIndex]!;
    const grapheme = token.grapheme;
    const supported = isSupportedScribeGrapheme(grapheme);
    const gesture = supported ? SCRIBE_GESTURES[grapheme] : MISSING_SCRIBE_GESTURE;
    const joinable = supported && grapheme !== ' ' && grapheme !== '.';
    repetition = joinable && previousGrapheme === grapheme ? repetition + 1 : 0;
    const nextGrapheme = input.tokens[tokenIndex + 1]?.grapheme;
    const variation = variationFor(
      input.seed,
      token,
      repetition,
      joinable && nextGrapheme !== ' ' && nextGrapheme !== '.' ? nextGrapheme : undefined,
    );

    if (!joinable) activeMain = undefined;

    gesture.strokes.forEach((authoredStroke, strokeIndex) => {
      const sampled = sampleAuthoredStroke(
        authoredStroke,
        token,
        gesture,
        originX,
        variation,
        fixedStep,
        samplingDensity,
        loopDetail,
        counterOpen,
      );
      if (sampled.length === 0) return;

      if (joinable && !authoredStroke.secondary) {
        if (!activeMain) {
          activeMain = { id: `stroke:${token.id}:main`, targets: sampled };
          strokes.push(activeMain);
        } else {
          const previous = activeMain.targets[activeMain.targets.length - 1]!;
          activeMain.targets.push(...connectorTargets(
            previous,
            sampled[0]!,
            fixedStep,
            samplingDensity,
          ));
          activeMain.targets.push(...sampled);
        }
      } else {
        strokes.push({ id: `stroke:${token.id}:${strokeIndex}`, targets: sampled });
      }
    });

    originX += gesture.advance;
    advances.push(originX);
    previousGrapheme = joinable ? grapheme : '';
  }

  return { strokes, advances, totalAdvance: originX };
}

function meshStroke(points: readonly PenPoint[]): StrokeMesh {
  if (points.length === 0) {
    return {
      positions: new Float32Array(),
      indices: new Uint32Array(),
      triangleOwners: [],
      outline: [],
    };
  }

  const positions = new Float32Array(points.length * 4);
  const left: Vec2[] = [];
  const right: Vec2[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    let tx = after.x - before.x;
    let ty = after.y - before.y;
    const magnitude = Math.hypot(tx, ty) || 1;
    tx /= magnitude;
    ty /= magnitude;
    const nx = -ty;
    const ny = tx;
    const leftPoint = { x: point.x + nx * point.radius, y: point.y + ny * point.radius };
    const rightPoint = { x: point.x - nx * point.radius, y: point.y - ny * point.radius };
    left.push(leftPoint);
    right.push(rightPoint);
    positions[i * 4] = leftPoint.x;
    positions[i * 4 + 1] = leftPoint.y;
    positions[i * 4 + 2] = rightPoint.x;
    positions[i * 4 + 3] = rightPoint.y;
  }

  const indices = new Uint32Array(Math.max(0, points.length - 1) * 6);
  const triangleOwners: (readonly string[])[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const offset = i * 6;
    const left0 = i * 2;
    const right0 = left0 + 1;
    const left1 = left0 + 2;
    const right1 = left0 + 3;
    indices.set([left0, right0, left1, right0, right1, left1], offset);
    const owners = mergeOwners(points[i]!.owners, points[i + 1]!.owners);
    triangleOwners.push(owners, owners);
  }

  const outline = [...left, ...right.reverse()];
  if (outline.length > 0) outline.push({ ...outline[0]! });
  return { positions, indices, triangleOwners, outline };
}

function simulateStroke(
  draft: TargetStroke,
  input: ScribeInput,
  fixedStep: number,
  fitX: number,
  minPressure: number,
  maxPressure: number,
  strokeScale: number,
  texture: number,
  startTime: number,
): PenStroke {
  const first = draft.targets[0]!;
  let x = first.x;
  let y = first.y;
  let velocityX = 0;
  let velocityY = 0;
  let pressure = minPressure;
  const points: PenPoint[] = [];
  const damping = Math.exp(-24 * fixedStep);
  const spring = 920;

  for (let i = 0; i < draft.targets.length; i++) {
    const target = draft.targets[i]!;
    if (i > 0) {
      const deltaX = target.x - x;
      const deltaY = target.y - y;
      velocityX = (velocityX + deltaX * spring * fixedStep) * damping;
      velocityY = (velocityY + deltaY * spring * fixedStep) * damping;
      x += velocityX * fixedStep + deltaX * 0.16;
      y += velocityY * fixedStep + deltaY * 0.16;
    }

    const desiredPressure = minPressure + (maxPressure - minPressure) * target.pressureTarget;
    pressure += (desiredPressure - pressure) * (input.quality === 'full' ? 0.24 : 0.34);
    pressure = Math.max(minPressure, Math.min(maxPressure, pressure));
    const noise = texture === 0
      ? 0
      : (stableUnit(input.seed, `${draft.id}:sample:${i}`) - 0.5) * texture;
    points.push({
      x: (x + noise) * input.pxPerEm * fitX,
      y: (y + noise * 0.45) * input.pxPerEm,
      time: startTime + i * fixedStep,
      pressure,
      radius: input.pxPerEm * strokeScale * (0.62 + pressure * 0.52),
      owners: target.owners,
    });
  }

  const mesh = meshStroke(points);
  return {
    id: draft.id,
    points,
    mesh,
    bounds: rectFromPoints(mesh.outline),
  };
}

function cross(origin: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points: readonly Vec2[]): Vec2[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Vec2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function rectanglePolygon(left: number, top: number, right: number, bottom: number): Vec2[] {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}

function selectionForToken(
  token: ScribeToken,
  index: number,
  strokes: readonly PenStroke[],
  advancePixels: readonly number[],
  top: number,
  bottom: number,
): SelectionEnvelope {
  const owned = strokes.flatMap((stroke) => stroke.points.filter((point) => point.owners.includes(token.id)));
  if (owned.length === 0) {
    const polygon = rectanglePolygon(advancePixels[index]!, top, advancePixels[index + 1]!, bottom);
    return {
      tokenId: token.id,
      sourceStart: token.sourceStart,
      sourceEnd: token.sourceEnd,
      kind: 'advance',
      polygon,
      bounds: rectFromPoints(polygon),
    };
  }

  const expanded: Vec2[] = [];
  for (const point of owned) {
    const radius = point.radius * 1.35;
    expanded.push(
      { x: point.x - radius, y: point.y - radius },
      { x: point.x + radius, y: point.y - radius },
      { x: point.x + radius, y: point.y + radius },
      { x: point.x - radius, y: point.y + radius },
    );
  }
  const polygon = convexHull(expanded);
  if (polygon.length > 0) polygon.push({ ...polygon[0]! });
  return {
    tokenId: token.id,
    sourceStart: token.sourceStart,
    sourceEnd: token.sourceEnd,
    kind: 'ink',
    polygon,
    bounds: rectFromPoints(polygon),
  };
}

function validateInput(input: ScribeInput): void {
  if (!(input.seed instanceof Uint8Array)) throw new TypeError('seed must be a Uint8Array');
  if (!Number.isFinite(input.pxPerEm) || input.pxPerEm <= 0) {
    throw new RangeError('pxPerEm must be a finite positive number');
  }
  if (Number.isNaN(input.maxWidth) || input.maxWidth <= 0) {
    throw new RangeError('maxWidth must be a positive number');
  }
  if (input.quality !== 'lite' && input.quality !== 'full') {
    throw new TypeError("quality must be 'lite' or 'full'");
  }
  if (input.tokens.length > MAX_SCRIBE_TOKENS) {
    throw new RangeError(`Scribe supports at most ${MAX_SCRIBE_TOKENS} tokens per run`);
  }

  const ids = new Set<string>();
  let previousEnd = -1;
  for (const token of input.tokens) {
    if (token.grapheme.length === 0) throw new TypeError(`Empty grapheme for Scribe token ${token.id}`);
    if (!token.id || ids.has(token.id)) throw new TypeError(`Duplicate or empty Scribe token id: ${token.id}`);
    ids.add(token.id);
    if (!Number.isInteger(token.sourceStart)
      || !Number.isInteger(token.sourceEnd)
      || token.sourceStart < 0
      || token.sourceEnd <= token.sourceStart
      || token.sourceStart < previousEnd) {
      throw new RangeError(`Invalid source span for Scribe token ${token.id}`);
    }
    previousEnd = token.sourceEnd;
  }
}

/** Render an immutable token run through the deterministic fixed-step hand. */
export function renderScribe(input: ScribeInput): ScribeRun {
  validateInput(input);
  const optics = opticalParameters(input.pxPerEm);
  const fixedStep = input.quality === 'full' ? 1 / 120 : 1 / 60;
  let targets = buildTargets(input, fixedStep, 1, optics.loopDetail, optics.counterOpen);
  let targetCount = targets.strokes.reduce((sum, stroke) => sum + stroke.targets.length, 0);

  // Full-rate authored sampling can exceed the public budget for a long run of
  // complex gestures. Reduce only target density, not the fixed motor clock:
  // short runs remain byte-identical, every segment keeps its endpoint, and
  // every token retains owned samples. A bounded binary search makes the
  // highest detail that fits deterministic across repaints.
  if (targetCount > MAX_SCRIBE_SAMPLES) {
    let lowerDensity = 0;
    let upperDensity = 1;
    let fitted = buildTargets(input, fixedStep, lowerDensity, optics.loopDetail, optics.counterOpen);
    let fittedCount = fitted.strokes.reduce((sum, stroke) => sum + stroke.targets.length, 0);
    if (fittedCount > MAX_SCRIBE_SAMPLES) {
      throw new RangeError(
        `Scribe minimum sample budget exceeded (${fittedCount}/${MAX_SCRIBE_SAMPLES})`,
      );
    }

    for (let iteration = 0; iteration < 16; iteration++) {
      const density = (lowerDensity + upperDensity) * 0.5;
      const candidate = buildTargets(input, fixedStep, density, optics.loopDetail, optics.counterOpen);
      const candidateCount = candidate.strokes.reduce(
        (sum, stroke) => sum + stroke.targets.length,
        0,
      );
      if (candidateCount <= MAX_SCRIBE_SAMPLES) {
        lowerDensity = density;
        fitted = candidate;
        fittedCount = candidateCount;
      } else {
        upperDensity = density;
      }
    }
    targets = fitted;
    targetCount = fittedCount;
  }

  const naturalWidth = targets.totalAdvance * input.pxPerEm;
  const fitX = naturalWidth > input.maxWidth ? input.maxWidth / naturalWidth : 1;
  const advancePixels = targets.advances.map((advance) => advance * input.pxPerEm * fitX);
  const strokes: PenStroke[] = [];
  let elapsed = 0;
  for (const draft of targets.strokes) {
    const stroke = simulateStroke(
      draft,
      input,
      fixedStep,
      fitX,
      0.7 - optics.pressureRange * 0.5,
      0.7 + optics.pressureRange * 0.5,
      optics.strokeScale,
      optics.texture,
      elapsed,
    );
    strokes.push(stroke);
    elapsed += draft.targets.length * fixedStep + fixedStep * 2;
  }

  const caretTop = -1.08 * input.pxPerEm;
  const caretBottom = 0.14 * input.pxPerEm;
  const carets: CaretSlot[] = advancePixels.map((x, index) => ({
    index,
    x,
    y: caretTop,
    sourceOffset: index === 0
      ? (input.tokens[0]?.sourceStart ?? 0)
      : input.tokens[index - 1]!.sourceEnd,
    top: caretTop,
    bottom: caretBottom,
    ...(index > 0 ? { beforeTokenId: input.tokens[index - 1]!.id } : {}),
    ...(index < input.tokens.length ? { afterTokenId: input.tokens[index]!.id } : {}),
  }));

  const selectionEnvelopes: SelectionEnvelope[] = input.tokens.map((token, index) => (
    selectionForToken(token, index, strokes, advancePixels, caretTop, caretBottom)
  ));
  const geometryBounds = unionRects([
    ...strokes.map((stroke) => stroke.bounds),
    ...selectionEnvelopes.map((envelope) => envelope.bounds),
  ]);
  const bounds = input.tokens.length === 0
    ? rectFromEdges(0, caretTop, 0, caretBottom)
    : geometryBounds;

  return {
    strokes,
    carets,
    selectionEnvelopes,
    bounds,
    profile: optics.profile,
    sampleCount: strokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
  };
}
