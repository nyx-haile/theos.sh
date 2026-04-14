import { createSignal, onMount, onCleanup } from 'solid-js';
import { detectTier } from './rendering/tier';
import { RenderingPipeline } from './rendering/pipeline';
import { ViewportComponent } from './ui/viewport';

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;
  const [tier, setTier] = createSignal(detectTier());
  const [status, setStatus] = createSignal('initializing...');

  onMount(() => {
    if (!canvasRef) return;

    try {
      // TODO: Remove this after implementing WebGPU/WebGL2 renderers
      // Force Tier 3 (ASCII) for now to see visible output
      const renderTier = 3; // tier();

      // Initialize rendering pipeline
      const pipeline = new RenderingPipeline(renderTier);

      // Initialize viewport component
      const viewport = new ViewportComponent();
      viewport.mount(canvasRef);

      // Test rendering with sample data
      const sampleDescriptor = {
        curvature_tensor: [[1.1, 0, 0], [0, 1.05, 0], [0, 0, 1.0]],
        christoffel_symbols: null,
        topology: { genus: 0, wormhole_pairs: [] },
        content_module_id: 0,
        color_params: { hue_offset: 0, saturation_scale: 1 },
        force_field: { direction: [0, 0, 1], magnitude: 0 },
      };

      // Render a grid of points
      for (let x = -5; x <= 5; x++) {
        for (let y = -5; y <= 5; y++) {
          pipeline.render([x, y, 0], sampleDescriptor);
        }
      }

      // For ASCII renderer, draw the grid to canvas
      if (renderTier === 3) {
        const ctx = canvasRef.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0a0e27';
          ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
          ctx.fillStyle = '#4a9eff';
          ctx.font = '12px monospace';

          const charWidth = 8;
          const charHeight = 16;
          for (let i = 0; i < Math.min(canvasRef.width / charWidth, 80); i++) {
            for (let j = 0; j < Math.min(canvasRef.height / charHeight, 24); j++) {
              // Simple pattern based on position
              const char = (i + j) % 2 === 0 ? '●' : '○';
              ctx.fillText(char, i * charWidth, j * charHeight + charHeight);
            }
          }
        }
      }

      setStatus(`tier ${renderTier} rendering...`);

      onCleanup(() => {
        viewport.unmount();
        pipeline.cleanup();
      });
    } catch (e) {
      setStatus(`error: ${e instanceof Error ? e.message : 'unknown'}`);
      console.error(e);
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
