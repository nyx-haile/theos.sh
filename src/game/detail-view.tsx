import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { ColorScheme } from '../color/scheme';

export interface DetailClient {
  fetchArtifactText(handle: string): Promise<string>;
}

export interface DetailViewProps {
  handle: string;
  client: DetailClient;
  onClose: () => void;
  scheme?: ColorScheme;
}

const CHARS_PER_FRAME = 3;

export function DetailView(props: DetailViewProps) {
  const [revealed, setRevealed] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    let fullText = '';
    let cursor = 0;
    let rafId = 0;

    const reveal = () => {
      cursor = Math.min(cursor + CHARS_PER_FRAME, fullText.length);
      setRevealed(fullText.slice(0, cursor));
      if (cursor < fullText.length) rafId = requestAnimationFrame(reveal);
    };

    props.client.fetchArtifactText(props.handle)
      .then(t => { fullText = t; reveal(); })
      .catch((e) => setError(String(e.message ?? e)));

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    onCleanup(() => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKey);
    });
  });

  const bg = props.scheme
    ? `rgba(${props.scheme.background.r},${props.scheme.background.g},${props.scheme.background.b},0.96)`
    : 'rgba(10,10,10,0.96)';
  const fg = props.scheme
    ? `rgb(${props.scheme.secondary.r},${props.scheme.secondary.g},${props.scheme.secondary.b})`
    : '#e0e0e0';

  return (
    <div
      data-testid="detail-view"
      style={{
        position: 'fixed', inset: '0', 'z-index': '10',
        background: bg,
        color: fg,
        padding: '4rem',
        'font-family': 'ui-monospace, monospace',
        'overflow-y': 'auto',
        'white-space': 'pre-wrap',
      }}
    >
      <Show when={error()}>
        <div data-testid="detail-error">unable to load artifact: {error()}</div>
      </Show>
      <Show when={revealed() !== null && !error()}>
        <div data-testid="detail-content">{revealed()}</div>
      </Show>
    </div>
  );
}
