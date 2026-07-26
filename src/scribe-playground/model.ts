export const MAX_GRAPHEMES = 64;
export const DEFAULT_TEXT = 'llelle';
export const DEFAULT_SEED_HEX = '7363726962652d7631000000000000000000000000000000000000000000000000';

export interface SemanticToken {
  id: string;
  grapheme: string;
}

export interface SelectionLike {
  rangeCount: number;
  getRangeAt(index: number): Pick<Range, 'collapsed' | 'intersectsNode'>;
}

export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const Segmenter = Intl.Segmenter as unknown as new (
      locales?: string | string[],
      options?: { granularity: 'grapheme' },
    ) => { segment(value: string): Iterable<{ segment: string }> };
    return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
      .map(({ segment }) => segment);
  }
  return Array.from(text);
}

export function clampText(text: string, limit = MAX_GRAPHEMES): {
  text: string;
  count: number;
  truncated: boolean;
} {
  const graphemes = splitGraphemes(text);
  const kept = graphemes.slice(0, limit);
  return {
    text: kept.join(''),
    count: kept.length,
    truncated: graphemes.length > limit,
  };
}

export function normalizeSeedHex(value: string | null | undefined): string {
  const cleaned = (value ?? '').trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(cleaned)) return DEFAULT_SEED_HEX;
  return cleaned.padEnd(64, '0').slice(0, 64);
}

export function seedBytes(seedHex: string): Uint8Array {
  const normalized = normalizeSeedHex(seedHex);
  return Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16),
  );
}

export function randomSeedHex(random: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = random(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function selectionTokenIds(
  root: HTMLElement,
  selection: SelectionLike | null,
): Set<string> {
  const selected = new Set<string>();
  if (!selection?.rangeCount) return selected;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return selected;
  for (const node of root.querySelectorAll<HTMLElement>('[data-scribe-token]')) {
    if (range.intersectsNode(node)) {
      const id = node.dataset.scribeToken;
      if (id) selected.add(id);
    }
  }
  return selected;
}

export function replaceUrlSeed(seedHex: string, locationLike: Pick<Location, 'href'>, historyLike: Pick<History, 'replaceState'>): void {
  const url = new URL(locationLike.href);
  url.searchParams.set('seed', normalizeSeedHex(seedHex));
  historyLike.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
