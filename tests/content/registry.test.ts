import { describe, it, expect } from 'vitest';
import { ContentRegistry } from '../../src/content/registry';
import type { ContentModule } from '../../src/content/types';

function makeModule(id: string): ContentModule {
  return {
    id,
    type: 'work',
    render_hints: {
      tier1: { splat_scale: 1, sdf_morph: true },
      tier2: { warp_intensity: 0.5, sdf_morph: true },
      tier3: { ascii_density: 0.5, border_char: '#' },
    },
    content: `content for ${id}`,
    interactions: [],
  };
}

const MODULES = [makeModule('a'), makeModule('b'), makeModule('c')];

describe('ContentRegistry', () => {
  it('throws when constructed with empty array', () => {
    expect(() => new ContentRegistry([])).toThrow('Registry must have at least one module');
  });

  it('resolve returns a module for any id', () => {
    const reg = new ContentRegistry(MODULES);
    const m = reg.resolve(0);
    expect(m).toBeDefined();
    expect(MODULES).toContain(m);
  });

  it('resolve wraps negative ids', () => {
    const reg = new ContentRegistry(MODULES);
    expect(reg.resolve(-1)).toBeDefined();
  });

  it('resolve wraps ids larger than registry length', () => {
    const reg = new ContentRegistry(MODULES);
    expect(reg.resolve(100)).toEqual(reg.resolve(100 % MODULES.length));
  });

  it('length matches constructor input', () => {
    const reg = new ContentRegistry(MODULES);
    expect(reg.length).toBe(3);
  });
});
