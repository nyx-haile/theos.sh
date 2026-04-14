import type { Tier } from '../manifold/types';
import type { Descriptor, GeodesicCoords } from '../manifold/types';
import { WebGPURenderer } from './tier-1/webgpu-renderer';
import { WebGL2Renderer } from './tier-2/webgl2-renderer';
import { ASCIIRenderer } from './tier-3/ascii-renderer';

export class RenderingPipeline {
  private tier: Tier;
  private webgpuRenderer?: WebGPURenderer;
  private webgl2Renderer?: WebGL2Renderer;
  private asciiRenderer?: ASCIIRenderer;

  constructor(tier: Tier) {
    this.tier = tier;

    if (tier === 1) {
      this.webgpuRenderer = new WebGPURenderer();
    } else if (tier === 2) {
      this.webgl2Renderer = new WebGL2Renderer();
    } else {
      this.asciiRenderer = new ASCIIRenderer(80, 24);
    }
  }

  render(coords: GeodesicCoords, descriptor: Descriptor): void {
    if (this.tier === 1 && this.webgpuRenderer) {
      this.webgpuRenderer.render(descriptor);
    } else if (this.tier === 2 && this.webgl2Renderer) {
      this.webgl2Renderer.render(descriptor);
    } else if (this.tier === 3 && this.asciiRenderer) {
      this.asciiRenderer.render(coords, descriptor);
    }
  }

  cleanup(): void {
    this.webgpuRenderer?.cleanup();
    this.webgl2Renderer?.cleanup();
  }
}
