import { createEffect, createSignal, onCleanup } from 'solid-js';
import { detectTier } from './rendering/tier';
import { RenderingPipeline } from './rendering/pipeline';
import { ViewportComponent } from './ui/viewport';

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;
  const [tier, setTier] = createSignal(detectTier());
  const [status, setStatus] = createSignal('initializing...');

  createEffect(() => {
    if (!canvasRef) return;

    try {
      // Initialize rendering pipeline
      const pipeline = new RenderingPipeline(tier());

      // Initialize viewport component
      const viewport = new ViewportComponent();
      viewport.mount(canvasRef);

      setStatus(`tier ${tier()} ready`);

      onCleanup(() => {
        viewport.unmount();
        pipeline.cleanup();
      });
    } catch (e) {
      setStatus(`error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      'flex-direction': 'column',
      background: '#0a0e27',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          flex: 1,
          display: 'block',
          background: 'linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%)',
        }}
      />
      <div style={{
        padding: '12px 16px',
        'font-size': '12px',
        'font-family': 'monospace',
        color: '#666',
        'border-top': '1px solid #1a2844',
      }}>
        {status()}
      </div>
    </div>
  );
}
