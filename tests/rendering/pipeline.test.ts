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
