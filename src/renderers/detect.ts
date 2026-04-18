export type RendererKind = 'ascii' | 'webgl2' | 'webgpu' | 'vector' | 'pixel';

export function detectRenderer(): RendererKind {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    console.info('Renderer webgpu not yet implemented; falling back to ASCII');
    return 'ascii';
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    if (c.getContext && c.getContext('webgl2')) {
      console.info('Renderer webgl2 not yet implemented; falling back to ASCII');
      return 'ascii';
    }
  }
  return 'ascii';
}
