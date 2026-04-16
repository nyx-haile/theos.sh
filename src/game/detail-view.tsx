import { createSignal, onCleanup, onMount, Show } from 'solid-js';

export interface DetailClient {
  fetchArtifactText(handle: string): Promise<string>;
}

export interface DetailViewProps {
  handle: string;
  client: DetailClient;
  onClose: () => void;
}

export function DetailView(props: DetailViewProps) {
  const [text, setText] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    props.client.fetchArtifactText(props.handle)
      .then(setText)
      .catch((e) => setError(String(e.message ?? e)));

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <div
      data-testid="detail-view"
      style={{
        position: 'fixed', inset: '0', 'z-index': '10',
        background: 'rgba(10,10,10,0.96)',
        color: '#e0e0e0',
        padding: '4rem',
        'font-family': 'ui-monospace, monospace',
        'overflow-y': 'auto',
        'white-space': 'pre-wrap',
      }}
    >
      <Show when={error()}>
        <div data-testid="detail-error">unable to load artifact: {error()}</div>
      </Show>
      <Show when={text() && !error()}>
        <div data-testid="detail-content">{text()}</div>
      </Show>
    </div>
  );
}
