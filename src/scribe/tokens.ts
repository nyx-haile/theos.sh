import type {
  ReconciledScribeTokens,
  ReconcileScribeTokenOptions,
  ScribeToken,
  ScribeTokenReconcilerOptions,
} from './types';

interface GraphemeSpan {
  grapheme: string;
  sourceStart: number;
  sourceEnd: number;
}

function graphemeSpans(text: string): GraphemeSpan[] {
  const spans: GraphemeSpan[] = [];
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: 'grapheme' },
    ) => { segment(value: string): Iterable<{ segment: string; index: number }> };
  }).Segmenter;

  if (Segmenter) {
    const segmenter = new Segmenter('und', { granularity: 'grapheme' });
    for (const item of segmenter.segment(text)) {
      spans.push({
        grapheme: item.segment,
        sourceStart: item.index,
        sourceEnd: item.index + item.segment.length,
      });
    }
    return spans;
  }

  let sourceStart = 0;
  for (const grapheme of Array.from(text)) {
    spans.push({
      grapheme,
      sourceStart,
      sourceEnd: sourceStart + grapheme.length,
    });
    sourceStart += grapheme.length;
  }
  return spans;
}

export function tokenizeScribeText(text: string, namespace = 'scribe'): ScribeToken[] {
  validateNamespace(namespace);
  return graphemeSpans(text).map((span, index) => ({
    id: `${namespace}:${index}`,
    ...span,
  }));
}

function lcsMatches(
  previous: readonly ScribeToken[],
  next: readonly GraphemeSpan[],
): Map<number, number> {
  const rows = previous.length + 1;
  const cols = next.length + 1;
  const table = new Uint16Array(rows * cols);

  for (let i = previous.length - 1; i >= 0; i--) {
    for (let j = next.length - 1; j >= 0; j--) {
      const cell = i * cols + j;
      table[cell] = previous[i]!.grapheme === next[j]!.grapheme
        ? table[(i + 1) * cols + j + 1]! + 1
        : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }

  const matches = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < previous.length && j < next.length) {
    if (previous[i]!.grapheme === next[j]!.grapheme) {
      matches.set(j, i);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

function inferredNextId(tokens: readonly ScribeToken[], namespace: string): number {
  let next = 0;
  const prefix = `${namespace}:`;
  for (const token of tokens) {
    if (!token.id.startsWith(prefix)) continue;
    const suffix = Number.parseInt(token.id.slice(prefix.length), 10);
    if (Number.isSafeInteger(suffix)) next = Math.max(next, suffix + 1);
  }
  return next;
}

function validateNamespace(namespace: string): void {
  if (namespace.length === 0) throw new TypeError('Scribe token namespace must not be empty');
}

function validateNextId(nextId: number): void {
  if (!Number.isSafeInteger(nextId) || nextId < 0) {
    throw new RangeError('Scribe token nextId must be a non-negative safe integer');
  }
}

/**
 * Reconcile by grapheme LCS. Reused characters retain identity even when their
 * UTF-16 offsets move; inserted characters receive never-before-used ids.
 */
export function reconcileScribeTokens(
  text: string,
  previous: readonly ScribeToken[],
  options: ReconcileScribeTokenOptions = {},
): ReconciledScribeTokens {
  const namespace = options.namespace ?? 'scribe';
  validateNamespace(namespace);
  const inferred = inferredNextId(previous, namespace);
  if (options.nextId !== undefined) validateNextId(options.nextId);
  let nextId = Math.max(options.nextId ?? inferred, inferred);
  const usedIds = new Set<string>();
  for (const token of previous) {
    if (!token.id || usedIds.has(token.id)) {
      throw new TypeError(`Duplicate or empty Scribe token id: ${token.id}`);
    }
    usedIds.add(token.id);
  }
  const spans = graphemeSpans(text);
  const matches = lcsMatches(previous, spans);
  const tokens = spans.map((span, index): ScribeToken => {
    const previousIndex = matches.get(index);
    if (previousIndex !== undefined) {
      return { id: previous[previousIndex]!.id, ...span };
    }
    while (usedIds.has(`${namespace}:${nextId}`)) nextId++;
    const id = `${namespace}:${nextId++}`;
    usedIds.add(id);
    return { id, ...span };
  });
  return { tokens, nextId };
}

export class ScribeTokenReconciler {
  private readonly namespace: string;
  private nextIdValue: number;
  private current: ScribeToken[];

  constructor(options: ScribeTokenReconcilerOptions = {}) {
    this.namespace = options.namespace ?? 'scribe';
    validateNamespace(this.namespace);
    this.current = (options.initialTokens ?? []).map((token) => ({ ...token }));
    const uniqueIds = new Set(this.current.map((token) => token.id));
    if (uniqueIds.size !== this.current.length || uniqueIds.has('')) {
      throw new TypeError('Initial Scribe token ids must be non-empty and unique');
    }
    const inferred = inferredNextId(this.current, this.namespace);
    if (options.nextId !== undefined) validateNextId(options.nextId);
    this.nextIdValue = Math.max(options.nextId ?? inferred, inferred);
  }

  get tokens(): readonly ScribeToken[] {
    return this.current.map((token) => ({ ...token }));
  }

  get nextId(): number {
    return this.nextIdValue;
  }

  update(text: string): ScribeToken[] {
    const result = reconcileScribeTokens(text, this.current, {
      namespace: this.namespace,
      nextId: this.nextIdValue,
    });
    this.current = result.tokens;
    this.nextIdValue = result.nextId;
    return this.current.map((token) => ({ ...token }));
  }
}
