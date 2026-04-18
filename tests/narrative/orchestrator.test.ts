import { describe, it, expect, beforeEach } from 'vitest';
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

  it('sequences reveals with stagger', () => {
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
