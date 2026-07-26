import { For, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import {
  ScribeTokenReconciler,
  renderScribe,
  type CaretSlot,
  type Rect,
  type ScribeRun,
  type ScribeToken,
  type Vec2,
} from '../scribe';
import {
  DEFAULT_SEED_HEX,
  DEFAULT_TEXT,
  MAX_GRAPHEMES,
  clampText,
  normalizeSeedHex,
  randomSeedHex,
  replaceUrlSeed,
  seedBytes,
  selectionTokenIds,
} from './model';

const PRESETS = ['llelle', 'hello hello', 'theos.sh'] as const;

interface Viewport extends Rect {
  viewBox: string;
}

function semanticBounds(run: ScribeRun): Rect {
  const xs = run.carets.map((caret) => caret.x);
  const tops = run.carets.map((caret) => caret.top);
  const bottoms = run.carets.map((caret) => caret.bottom);
  const left = Math.min(run.bounds.left, ...xs);
  const top = Math.min(run.bounds.top, ...tops);
  const right = Math.max(run.bounds.right, ...xs);
  const bottom = Math.max(run.bounds.bottom, ...bottoms);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function expandBounds(bounds: Rect, pxPerEm: number): Viewport {
  const padding = Math.max(4, pxPerEm * 0.16);
  const left = bounds.left - padding;
  const top = bounds.top - padding;
  const right = bounds.right + padding;
  const bottom = bounds.bottom + padding;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    viewBox: `${left} ${top} ${width} ${height}`,
  };
}

function polygon(points: readonly Vec2[]): string {
  return points.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
}

function findCaret(carets: readonly CaretSlot[], sourceOffset: number): CaretSlot | undefined {
  return carets.find((caret) => caret.sourceOffset === sourceOffset);
}

function percent(value: number, start: number, size: number): string {
  return `${((value - start) / Math.max(1, size)) * 100}%`;
}

export function ScribePlayground() {
  const locationSeed = typeof location === 'undefined'
    ? DEFAULT_SEED_HEX
    : new URL(location.href).searchParams.get('seed');
  const reconciler = new ScribeTokenReconciler({ namespace: 'playground' });
  const initialTokens = reconciler.update(DEFAULT_TEXT);

  const [text, setText] = createSignal(DEFAULT_TEXT);
  const [tokens, setTokens] = createSignal<readonly ScribeToken[]>(initialTokens);
  const [pxPerEm, setPxPerEm] = createSignal(92);
  const [seedHex, setSeedHex] = createSignal(normalizeSeedHex(locationSeed));
  const [selectedIds, setSelectedIds] = createSignal<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = createSignal(`${initialTokens.length} graphemes`);
  let semanticRoot: HTMLDivElement | undefined;

  const run = createMemo(() => renderScribe({
    tokens: tokens(),
    seed: seedBytes(seedHex()),
    pxPerEm: pxPerEm(),
    maxWidth: Math.min(8192, Math.max(320, tokens().length * pxPerEm() * 1.15)),
    quality: 'full',
  }));
  const viewport = createMemo(() => expandBounds(semanticBounds(run()), pxPerEm()));
  const stageDimensions = createMemo(() => {
    const box = viewport();
    const scale = Math.max(1, 280 / box.width, 150 / box.height);
    return { width: box.width * scale, height: box.height * scale };
  });
  const selectedEnvelopes = createMemo(() =>
    run().selectionEnvelopes.filter((envelope) => selectedIds().has(envelope.tokenId)),
  );

  function updateText(value: string): void {
    const limited = clampText(value);
    setText(limited.text);
    setTokens(reconciler.update(limited.text));
    setSelectedIds(new Set<string>());
    setNotice(limited.truncated
      ? `Input limited to ${MAX_GRAPHEMES} graphemes`
      : `${limited.count} graphemes`);
  }

  function updateSeed(value: string): void {
    const normalized = normalizeSeedHex(value);
    setSeedHex(normalized);
    if (typeof location !== 'undefined') replaceUrlSeed(normalized, location, history);
  }

  function reroll(): void {
    updateSeed(randomSeedHex((bytes) => {
      if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(bytes);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
      return bytes;
    }));
  }

  function tokenStyle(token: ScribeToken): Record<string, string> {
    const currentRun = run();
    const box = viewport();
    const start = findCaret(currentRun.carets, token.sourceStart);
    const end = findCaret(currentRun.carets, token.sourceEnd);
    const fallbackWidth = box.width / Math.max(1, tokens().length);
    const left = start?.x ?? box.left + token.sourceStart * fallbackWidth;
    const right = end?.x ?? left + fallbackWidth;
    const top = Math.min(start?.top ?? currentRun.bounds.top, end?.top ?? currentRun.bounds.top);
    const bottom = Math.max(start?.bottom ?? currentRun.bounds.bottom, end?.bottom ?? currentRun.bounds.bottom);
    return {
      left: percent(left, box.left, box.width),
      top: percent(top, box.top, box.height),
      width: `${Math.max(0.25, ((right - left) / box.width) * 100)}%`,
      height: `${Math.max(1, ((bottom - top) / box.height) * 100)}%`,
      'font-size': `${pxPerEm()}px`,
    };
  }

  onMount(() => {
    updateSeed(seedHex());
    const updateSelection = () => {
      setSelectedIds(semanticRoot
        ? selectionTokenIds(semanticRoot, document.getSelection())
        : new Set<string>());
    };
    document.addEventListener('selectionchange', updateSelection);
    onCleanup(() => document.removeEventListener('selectionchange', updateSelection));
  });

  return (
    <main class="scribe-page">
      <header class="scribe-header">
        <div>
          <p class="scribe-kicker">theos.sh / motor text experiment 01</p>
          <h1>Scribe</h1>
        </div>
        <p class="scribe-intro">
          Text is the score. The visible line is a repeatable pen performance whose motion carries across letters.
        </p>
      </header>

      <section class="scribe-workbench" aria-labelledby="scribe-controls-title">
        <aside class="scribe-controls">
          <h2 id="scribe-controls-title">Performance</h2>
          <label class="scribe-field" for="scribe-text">
            Text
            <input
              id="scribe-text"
              data-testid="scribe-input"
              type="text"
              value={text()}
              aria-describedby="scribe-limit"
              autocomplete="off"
              spellcheck={false}
              onInput={(event) => {
                updateText(event.currentTarget.value);
                event.currentTarget.value = text();
              }}
            />
          </label>
          <p id="scribe-limit" class="scribe-help">One line, up to {MAX_GRAPHEMES} graphemes.</p>

          <div class="scribe-field">
            <span>Presets</span>
            <div class="scribe-presets" aria-label="Text presets">
              <For each={PRESETS}>{(preset) => (
                <button type="button" onClick={() => updateText(preset)}>{preset}</button>
              )}</For>
            </div>
          </div>

          <label class="scribe-field" for="scribe-size">
            <span class="scribe-label-row"><span>Writing size</span><output>{pxPerEm()} px</output></span>
            <input
              id="scribe-size"
              data-testid="scribe-size"
              type="range"
              min="18"
              max="180"
              step="1"
              value={pxPerEm()}
              onInput={(event) => setPxPerEm(Number(event.currentTarget.value))}
            />
          </label>

          <div class="scribe-seed">
            <div>
              <span>Performance seed</span>
              <code title={seedHex()}>{seedHex().slice(0, 12)}</code>
            </div>
            <button type="button" data-testid="scribe-reroll" onClick={reroll}>Reroll</button>
          </div>
        </aside>

        <div class="scribe-stage-panel">
          <div class="scribe-stage-meta">
            <span>{run().profile} profile</span>
            <span>{run().sampleCount.toLocaleString()} samples</span>
            <span>{selectedIds().size ? `${selectedIds().size} selected` : notice()}</span>
          </div>

          <div class="scribe-stage-scroll">
            <div
              class="scribe-stage"
              data-testid="scribe-stage"
              style={{
                width: `${stageDimensions().width}px`,
                height: `${stageDimensions().height}px`,
              }}
            >
              <svg
                class="scribe-ink"
                data-testid="scribe-ink"
                viewBox={viewport().viewBox}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <g class="scribe-selection-ink">
                  <For each={selectedEnvelopes()}>{(envelope) => (
                    <polygon data-selected-token={envelope.tokenId} points={polygon(envelope.polygon)} />
                  )}</For>
                </g>
                <g class="scribe-strokes">
                  <For each={run().strokes}>{(stroke) => (
                    <polygon data-stroke={stroke.id} points={polygon(stroke.mesh.outline)} />
                  )}</For>
                </g>
              </svg>

              <div
                ref={semanticRoot}
                class="scribe-semantic-text"
                data-testid="scribe-semantic-text"
                aria-describedby="scribe-output-description"
              >
                <For each={tokens()}>{(token) => (
                  <span data-scribe-token={token.id} style={tokenStyle(token)}>{token.grapheme}</span>
                )}</For>
              </div>
            </div>
          </div>
          <p id="scribe-output-description" class="scribe-sr-only">
            Selectable source text aligned with deterministic procedural handwriting.
          </p>
        </div>
      </section>

      <footer class="scribe-footer">
        <p><strong>Semantic layer:</strong> real grapheme spans for selection, copying, search, and assistive technology.</p>
        <p><strong>Ink layer:</strong> authored motor gestures, inherited velocity, pressure, rhythm, and repetition state.</p>
      </footer>
    </main>
  );
}
