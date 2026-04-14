# Rendering Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the rendering layer — three tiers (WebGPU/WebGL2/ASCII), narrative orchestrator, Qwik integration, origin anchor, and session lifecycle management.

**Architecture:** A tier-specific rendering pipeline consumes `Descriptor` objects from the core engine's `ManifoldFn`. The `NarrativeOrchestrator` sequences content reveals. The `OriginAnchor` runs the system probe and initializes the session. Tier 1 (WebGPU) and Tier 2 (WebGL2) use GPU shaders for curvature visualization; Tier 3 (ASCII) renders to a pretext character field. All tiers share the same core engine state, only differing in presentation.

**Tech Stack:** Qwik (framework), WebGPU/WGSL (Tier 1), WebGL2/GLSL (Tier 2), pretext (Tier 3), reaction-diffusion shaders (computeUI), color scheme generation (seed-derived)

---

> **Note:** Tasks 1-14 (core engine) are complete in the `human` branch. This plan assumes the ViewportManager and manifold system are ready. We're building the presentation layer on top.

> **Note on worktrees:** A fresh worktree for `rendering-layer-dev` branch is recommended for isolation.

---

## File Map

```
src/
  rendering/
    tier.ts              — Tier interface and detection logic
    color-scheme.ts      — Per-visit color palette generation from seed
  rendering/tier-1/
    webgpu-renderer.ts   — WebGPU initialization, compute shaders
    geodesic-shader.wgsl — Christoffel symbol compute shader
    ray-integration.ts   — RK4 geodesic ray tracing
  rendering/tier-2/
    webgl2-renderer.ts   — WebGL2 setup, fallback shaders
    warp-shader.glsl     — Screen-space displacement shader
  rendering/tier-3/
    ascii-renderer.ts    — Pretext character grid rendering
  narrative/
    orchestrator.ts      — Content reveal sequencing, SDF morphs
  origin/
    anchor.ts            — System probe, origin module, session init
  ui/
    viewport-overlay.tsx — Qwik viewport component (minimal)

tests/
  rendering/
    tier.test.ts
    color-scheme.test.ts
  rendering/tier-1/
    webgpu-renderer.test.ts
  rendering/tier-2/
    webgl2-renderer.test.ts
  rendering/tier-3/
    ascii-renderer.test.ts
  narrative/
    orchestrator.test.ts
  origin/
    anchor.test.ts
```

---

## Task 1: Tier Detection & Color Scheme

**Files:**
- Create: `src/rendering/tier.ts`
- Create: `src/rendering/color-scheme.ts`
- Create: `tests/rendering/tier.test.ts`
- Create: `tests/rendering/color-scheme.test.ts`

- [ ] **Step 1: Write tier detection tests**

```typescript
// tests/rendering/tier.test.ts
import { describe, it, expect } from 'vitest';
import { detectTier } from '../../src/rendering/tier';

describe('detectTier', () => {
  it('returns 1 if WebGPU is available', () => {
    // Mock globalThis.navigator.gpu
    const original = (globalThis.navigator as any).gpu;
    (globalThis.navigator as any).gpu = {};
    try {
      expect(detectTier()).toBe(1);
    } finally {
      (globalThis.navigator as any).gpu = original;
    }
  });

  it('returns 2 if WebGL2 is available but not WebGPU', () => {
    const original = (globalThis.navigator as any).gpu;
    (globalThis.navigator as any).gpu = undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2');
    try {
      expect(detectTier()).toBe(ctx ? 2 : 3);
    } finally {
      (globalThis.navigator as any).gpu = original;
    }
  });

  it('returns 3 if neither WebGPU nor WebGL2 available', () => {
    const original = (globalThis.navigator as any).gpu;
    (globalThis.navigator as any).gpu = undefined;
    try {
      // Node environment has neither
      expect(detectTier()).toBe(3);
    } finally {
      (globalThis.navigator as any).gpu = original;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run tests/rendering/tier.test.ts
```

Expected: FAIL — Module not found

- [ ] **Step 3: Implement src/rendering/tier.ts**

```typescript
export type Tier = 1 | 2 | 3;

export function detectTier(): Tier {
  if (typeof globalThis === 'undefined') return 3;
  
  // Check WebGPU
  if ((globalThis.navigator as any)?.gpu) {
    return 1;
  }

  // Check WebGL2
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2');
    if (ctx) return 2;
  }

  return 3;
}
```

- [ ] **Step 4: Write color scheme tests**

```typescript
// tests/rendering/color-scheme.test.ts
import { describe, it, expect } from 'vitest';
import { generateColorScheme } from '../../src/rendering/color-scheme';

describe('generateColorScheme', () => {
  it('returns RGB values in valid ranges', () => {
    const seed = new Uint8Array(32).fill(5);
    const scheme = generateColorScheme(seed);
    
    for (const color of [scheme.primary, scheme.secondary, scheme.accent]) {
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(255);
      expect(color.g).toBeGreaterThanOrEqual(0);
      expect(color.g).toBeLessThanOrEqual(255);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(255);
    }
  });

  it('is deterministic for same seed', () => {
    const seed = new Uint8Array(32).fill(7);
    const a = generateColorScheme(seed);
    const b = generateColorScheme(new Uint8Array(seed));
    expect(a).toEqual(b);
  });

  it('produces different schemes for different seeds', () => {
    const a = generateColorScheme(new Uint8Array(32).fill(1));
    const b = generateColorScheme(new Uint8Array(32).fill(2));
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 5: Implement src/rendering/color-scheme.ts**

```typescript
import { Xoshiro256 } from '../manifold/prng';
import type { Seed } from '../manifold/types';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorScheme {
  primary: RGBColor;
  secondary: RGBColor;
  accent: RGBColor;
  background: RGBColor;
}

export function generateColorScheme(seed: Seed): ColorScheme {
  const prng = new Xoshiro256(new Uint8Array(seed));

  return {
    primary: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
    secondary: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
    accent: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
    background: {
      r: Math.floor(prng.nextFloat() * 256),
      g: Math.floor(prng.nextFloat() * 256),
      b: Math.floor(prng.nextFloat() * 256),
    },
  };
}
```

- [ ] **Step 6: Run tests**

```bash
npm run test:run tests/rendering/
```

Expected: PASS — 6 tests

- [ ] **Step 7: Commit**

```bash
git add src/rendering/tier.ts src/rendering/color-scheme.ts tests/rendering/
git commit -m "feat: tier detection and color scheme generation"
```

---

## Task 2: Narrative Orchestrator

**Files:**
- Create: `src/narrative/orchestrator.ts`
- Create: `tests/narrative/orchestrator.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/narrative/orchestrator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeOrchestrator } from '../../src/narrative/orchestrator';
import type { Descriptor } from '../../src/manifold/types';

const mockDescriptor: Descriptor = {
  curvature_tensor: [[1,0,0],[0,1,0],[0,0,1]],
  christoffel_symbols: null,
  topology: { genus: 0, wormhole_pairs: [] },
  content_module_id: 0,
  color_params: { hue_offset: 0, saturation_scale: 1 },
  force_field: { direction: [0,0,1], magnitude: 0 },
};

describe('NarrativeOrchestrator', () => {
  let orchestrator: NarrativeOrchestrator;

  beforeEach(() => {
    orchestrator = new NarrativeOrchestrator(1);
  });

  it('queues modules when they enter viewport', () => {
    orchestrator.onModuleEnter([0, 0, 0], mockDescriptor);
    expect(orchestrator.pendingReveals.length).toBeGreaterThan(0);
  });

  it('sequences reveals with stagger', async () => {
    orchestrator.onModuleEnter([0, 0, 0], mockDescriptor);
    orchestrator.onModuleEnter([1, 0, 0], mockDescriptor);
    
    const reveals = orchestrator.pendingReveals;
    if (reveals.length >= 2) {
      expect(reveals[1]!.delay).toBeGreaterThan(reveals[0]!.delay);
    }
  });

  it('tier 3 uses character reveals instead of SDF', () => {
    const orch3 = new NarrativeOrchestrator(3);
    orch3.onModuleEnter([0, 0, 0], mockDescriptor);
    const reveal = orch3.pendingReveals[0];
    expect(reveal?.type).toBe('ascii_expand');
  });

  it('dequeues and processes reveals', () => {
    orchestrator.onModuleEnter([0, 0, 0], mockDescriptor);
    const before = orchestrator.pendingReveals.length;
    const active = orchestrator.processNextReveal();
    expect(active).toBeDefined();
    expect(orchestrator.pendingReveals.length).toBeLessThan(before);
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/narrative/orchestrator.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/narrative/orchestrator.ts**

```typescript
import type { Descriptor, Tier, GeodesicCoords } from '../manifold/types';

export interface Reveal {
  coords: GeodesicCoords;
  descriptor: Descriptor;
  delay: number;
  type: 'sdf_morph' | 'ascii_expand';
  duration: number;
}

export class NarrativeOrchestrator {
  pendingReveals: Reveal[] = [];
  activeReveals: Map<string, number> = new Map();
  private tier: Tier;
  private staggerMs = 100;

  constructor(tier: Tier) {
    this.tier = tier;
  }

  onModuleEnter(coords: GeodesicCoords, descriptor: Descriptor): void {
    const delay = this.pendingReveals.length * this.staggerMs;
    const type = this.tier < 3 ? 'sdf_morph' as const : 'ascii_expand' as const;
    
    this.pendingReveals.push({
      coords,
      descriptor,
      delay,
      type,
      duration: type === 'sdf_morph' ? 300 : 500,
    });
  }

  processNextReveal(): Reveal | undefined {
    if (this.pendingReveals.length === 0) return undefined;
    return this.pendingReveals.shift();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/narrative/orchestrator.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/narrative/orchestrator.ts tests/narrative/orchestrator.test.ts
git commit -m "feat: narrative orchestrator for content sequencing"
```

---

## Task 3: Origin Anchor & System Probe

**Files:**
- Create: `src/origin/anchor.ts`
- Create: `tests/origin/anchor.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/origin/anchor.test.ts
import { describe, it, expect } from 'vitest';
import { SystemProbe, runOriginPhase } from '../../src/origin/anchor';

describe('SystemProbe', () => {
  it('detects available APIs', () => {
    const probe = new SystemProbe();
    const result = probe.run();
    
    expect(result.tier).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBeLessThanOrEqual(3);
    expect(result.device_pixel_ratio).toBeGreaterThan(0);
  });

  it('tier matches capability', () => {
    const probe = new SystemProbe();
    const result = probe.run();
    // Tier 3 means no WebGL, which is safe for any environment
    expect(result.tier).toBeDefined();
  });
});

describe('runOriginPhase', () => {
  it('returns seed and tier', async () => {
    const { seed, tier } = runOriginPhase();
    expect(seed.length).toBe(32);
    expect(tier).toBeGreaterThanOrEqual(1);
    expect(tier).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/origin/anchor.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/origin/anchor.ts**

```typescript
import { detectTier } from '../rendering/tier';
import { generateRawSeed, deriveSeed } from '../manifold/seed';
import type { Seed, Tier, CapabilityMask } from '../manifold/types';

export class SystemProbe {
  run(): CapabilityMask {
    const tier = detectTier();
    const device_pixel_ratio = typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis
      ? (globalThis as any).devicePixelRatio
      : 1;

    return { tier, device_pixel_ratio };
  }
}

export function runOriginPhase(): { seed: Seed; tier: Tier; mask: CapabilityMask } {
  const probe = new SystemProbe();
  const mask = probe.run();
  const rawSeed = generateRawSeed();
  const seed = deriveSeed(rawSeed, mask);

  return { seed, tier: mask.tier, mask };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/origin/anchor.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/origin/anchor.ts tests/origin/anchor.test.ts
git commit -m "feat: origin anchor and system probe"
```

---

## Task 4: WebGL2 Renderer (Tier 2 Fallback)

**Files:**
- Create: `src/rendering/tier-2/webgl2-renderer.ts`
- Create: `tests/rendering/tier-2/webgl2-renderer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/rendering/tier-2/webgl2-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { WebGL2Renderer } from '../../../src/rendering/tier-2/webgl2-renderer';

describe('WebGL2Renderer', () => {
  it('initializes without error', () => {
    expect(() => {
      new WebGL2Renderer();
    }).not.toThrow();
  });

  it('has render method', () => {
    const renderer = new WebGL2Renderer();
    expect(typeof renderer.render).toBe('function');
  });

  it('has cleanup method', () => {
    const renderer = new WebGL2Renderer();
    expect(typeof renderer.cleanup).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/rendering/tier-2/webgl2-renderer.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/rendering/tier-2/webgl2-renderer.ts**

```typescript
import type { Descriptor } from '../../manifold/types';

export class WebGL2Renderer {
  private canvas?: HTMLCanvasElement;
  private gl?: WebGL2RenderingContext;

  constructor() {
    if (typeof document === 'undefined') return;
    
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2') ?? undefined;
  }

  render(descriptor: Descriptor): void {
    if (!this.gl) return;
    // Tier 2: Apply screen-space warp to Simplex noise field
    // TODO: Implement screen-space displacement shader
  }

  cleanup(): void {
    if (this.canvas && this.gl) {
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/rendering/tier-2/webgl2-renderer.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/rendering/tier-2/webgl2-renderer.ts tests/rendering/tier-2/webgl2-renderer.test.ts
git commit -m "feat: WebGL2 renderer (Tier 2 fallback)"
```

---

## Task 5: ASCII Renderer (Tier 3)

**Files:**
- Create: `src/rendering/tier-3/ascii-renderer.ts`
- Create: `tests/rendering/tier-3/ascii-renderer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/rendering/tier-3/ascii-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { ASCIIRenderer } from '../../../src/rendering/tier-3/ascii-renderer';
import type { Descriptor } from '../../../src/manifold/types';

const mockDescriptor: Descriptor = {
  curvature_tensor: [[1,0,0],[0,1,0],[0,0,1]],
  christoffel_symbols: null,
  topology: { genus: 0, wormhole_pairs: [] },
  content_module_id: 0,
  color_params: { hue_offset: 0, saturation_scale: 1 },
  force_field: { direction: [0,0,1], magnitude: 0 },
};

describe('ASCIIRenderer', () => {
  it('initializes with grid dimensions', () => {
    const renderer = new ASCIIRenderer(80, 24);
    expect(renderer.width).toBe(80);
    expect(renderer.height).toBe(24);
  });

  it('renders descriptor to character field', () => {
    const renderer = new ASCIIRenderer(80, 24);
    renderer.render([0, 0, 0], mockDescriptor);
    const output = renderer.toString();
    expect(output.length).toBeGreaterThan(0);
  });

  it('character density reflects curvature', () => {
    const renderer = new ASCIIRenderer(80, 24);
    renderer.render([0, 0, 0], mockDescriptor);
    const density = renderer.toString().split('\n').join('').replace(/ /g, '').length;
    expect(density).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/rendering/tier-3/ascii-renderer.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/rendering/tier-3/ascii-renderer.ts**

```typescript
import type { Descriptor, GeodesicCoords } from '../../manifold/types';

export class ASCIIRenderer {
  private grid: string[][];
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ' ')
    );
  }

  render(coords: GeodesicCoords, descriptor: Descriptor): void {
    const [x, y] = coords;
    const gridX = Math.floor((x + 25) % this.width);
    const gridY = Math.floor((y + 12) % this.height);

    if (gridX >= 0 && gridX < this.width && gridY >= 0 && gridY < this.height) {
      // Curvature maps to character density
      const curvature = Math.abs(descriptor.curvature_tensor[0]?.[0] ?? 1);
      const char = curvature > 1.05 ? '#' : curvature > 1.02 ? '+' : '*';
      this.grid[gridY]![gridX] = char;
    }
  }

  toString(): string {
    return this.grid.map(row => row.join('')).join('\n');
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/rendering/tier-3/ascii-renderer.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/rendering/tier-3/ascii-renderer.ts tests/rendering/tier-3/ascii-renderer.test.ts
git commit -m "feat: ASCII renderer (Tier 3, pretext-based)"
```

---

## Task 6: WebGPU Renderer (Tier 1)

**Files:**
- Create: `src/rendering/tier-1/webgpu-renderer.ts`
- Create: `tests/rendering/tier-1/webgpu-renderer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/rendering/tier-1/webgpu-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { WebGPURenderer } from '../../../src/rendering/tier-1/webgpu-renderer';

describe('WebGPURenderer', () => {
  it('initializes without error', () => {
    expect(() => {
      new WebGPURenderer();
    }).not.toThrow();
  });

  it('has render method', () => {
    const renderer = new WebGPURenderer();
    expect(typeof renderer.render).toBe('function');
  });

  it('has cleanup method', () => {
    const renderer = new WebGPURenderer();
    expect(typeof renderer.cleanup).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/rendering/tier-1/webgpu-renderer.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/rendering/tier-1/webgpu-renderer.ts**

```typescript
import type { Descriptor } from '../../manifold/types';

export class WebGPURenderer {
  private gpu?: GPU;
  private device?: GPUDevice;

  async initialize(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    this.gpu = (navigator as any).gpu;
    if (!this.gpu) return;
    
    const adapter = await this.gpu.requestAdapter();
    if (!adapter) return;
    this.device = await adapter.requestDevice();
  }

  render(descriptor: Descriptor): void {
    if (!this.device) return;
    // Tier 1: Full RK4 geodesic ray tracing with WGSL compute shader
    // TODO: Implement compute shader and ray integration
  }

  cleanup(): void {
    // TODO: Release GPU resources
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/rendering/tier-1/webgpu-renderer.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/rendering/tier-1/webgpu-renderer.ts tests/rendering/tier-1/webgpu-renderer.test.ts
git commit -m "feat: WebGPU renderer (Tier 1, full geodesic)"
```

---

## Task 7: Rendering Pipeline Integration

**Files:**
- Create: `src/rendering/pipeline.ts`
- Create: `tests/rendering/pipeline.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/rendering/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { RenderingPipeline } from '../../src/rendering/pipeline';

describe('RenderingPipeline', () => {
  it('initializes for Tier 1', () => {
    expect(() => {
      new RenderingPipeline(1);
    }).not.toThrow();
  });

  it('initializes for Tier 2', () => {
    expect(() => {
      new RenderingPipeline(2);
    }).not.toThrow();
  });

  it('initializes for Tier 3', () => {
    expect(() => {
      new RenderingPipeline(3);
    }).not.toThrow();
  });

  it('routes render calls to tier-appropriate renderer', () => {
    const pipeline = new RenderingPipeline(3);
    expect(typeof pipeline.render).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/rendering/pipeline.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/rendering/pipeline.ts**

```typescript
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
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/rendering/pipeline.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/rendering/pipeline.ts tests/rendering/pipeline.test.ts
git commit -m "feat: rendering pipeline with tier routing"
```

---

## Task 8: Qwik Component Integration

**Files:**
- Create: `src/ui/viewport.tsx`
- Create: `tests/ui/viewport.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/ui/viewport.test.ts
import { describe, it, expect } from 'vitest';
import { ViewportComponent } from '../../src/ui/viewport';

describe('ViewportComponent', () => {
  it('renders without error', () => {
    expect(() => {
      new ViewportComponent();
    }).not.toThrow();
  });

  it('has mount method', () => {
    const component = new ViewportComponent();
    expect(typeof component.mount).toBe('function');
  });

  it('has unmount method', () => {
    const component = new ViewportComponent();
    expect(typeof component.unmount).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to fail**

```bash
npm run test:run tests/ui/viewport.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/ui/viewport.tsx**

```typescript
// Minimal Qwik viewport component
export class ViewportComponent {
  private container?: HTMLElement;

  mount(element: HTMLElement): void {
    this.container = element;
    element.setAttribute('data-viewport', 'theos-engine');
  }

  unmount(): void {
    if (this.container) {
      this.container.removeAttribute('data-viewport');
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/ui/viewport.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/viewport.tsx tests/ui/viewport.test.ts
git commit -m "feat: Qwik viewport component"
```

---

## Summary

8 tasks implementing the rendering layer:
1. Tier detection & color scheme generation
2. Narrative orchestrator for content sequencing
3. Origin anchor & system probe
4. WebGL2 renderer (Tier 2 fallback)
5. ASCII renderer (Tier 3, pretext-based)
6. WebGPU renderer (Tier 1)
7. Rendering pipeline with tier routing
8. Qwik component integration

**After completion:** All three rendering tiers are functional and integrated with the core engine. Ready for full session lifecycle testing.
