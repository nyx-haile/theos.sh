import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';
import { DetailView, type DetailClient } from './game/detail-view';

const surfaceClient: DetailClient = {
  fetchArtifactText: async (handle) =>
    `# artifact ${handle}\n\nyou stand on a ridge of the surface.\nthe terrain remembers nothing about you, and yet you are here.\n`,
};

function seedFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  const clean = hex.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}

export default function SurfaceApp() {
  const urlSeed = new URL(location.href).searchParams.get('seed') ?? '00';
  const seed = seedFromHex(urlSeed);
  const game = createGame(seed);

  if ((import.meta as any).env?.DEV) {
    (window as any).theos = { ...(window as any).theos, game, tunables: game.tunables };
  }

  const keys: KeyState = applyKeys({});
  const [frameText, setFrameText] = createSignal('');
  const [hintVisible, setHintVisible] = createSignal(false);
  const [openHandle, setOpenHandle] = createSignal<string | null>(null);

  const downMap: Record<string, keyof KeyState> = {
    w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', r: 'r', f: 'f',
  };

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && hintVisible() && !openHandle()) {
      const near = game.nearestArtifact();
      if (near) setOpenHandle(`surface-${near.artifact.id}`);
      return;
    }
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = true;
  }
  function onKeyUp(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = false;
  }

  let raf = 0;
  let last = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!openHandle()) game.tick(dt, keys);
    const frame = game.frame();
    let out = '';
    for (let j = 0; j < frame.cellsHigh; j++) {
      for (let i = 0; i < frame.cellsWide; i++) {
        out += frame.glyphs[j * frame.cellsWide + i];
      }
      out += '\n';
    }
    setFrameText(out);
    setHintVisible(game.nearestArtifact() !== null);
    raf = requestAnimationFrame(loop);
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    cancelAnimationFrame(raf);
  });

  return (
    <>
      <pre style={{
        margin: 0,
        padding: 0,
        background: '#000',
        color: '#ddd',
        'font-family': 'ui-monospace, Menlo, monospace',
        'font-size': '12px',
        'line-height': '1',
        'white-space': 'pre',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
      }}>{frameText()}</pre>
      <Show when={hintVisible() && !openHandle()}>
        <div data-testid="proximity-hint" style={{ display: 'none' }} />
      </Show>
      <Show when={openHandle()}>
        <DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} />
      </Show>
    </>
  );
}
