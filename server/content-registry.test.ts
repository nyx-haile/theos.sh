import { describe, it, expect } from 'vitest';
import { loadContentRegistry } from './content-registry';

describe('content-registry', () => {
  it('loads the a11y-about artifact from content/', async () => {
    const reg = await loadContentRegistry('./content');
    const art = reg.get('a11y-about');
    expect(art).toBeDefined();
    expect(art!.id).toBe('a11y-about');
    expect(art!.meta.kind).toBe('pretext');
    expect(art!.meta.title).toBe('about theos.sh');
    expect(art!.payloadPath).toMatch(/text\.md$/);
  });

  it('computes a seed-derived position with the configured distance', async () => {
    const reg = await loadContentRegistry('./content');
    const seed = new Uint8Array(32);
    seed[0] = 1; // deterministic
    const pos = reg.positionFor('a11y-about', seed);
    const distance = Math.hypot(pos[0], pos[1]);
    expect(distance).toBeCloseTo(8, 5);
  });

  it('lists all artifact ids', async () => {
    const reg = await loadContentRegistry('./content');
    expect(reg.ids()).toContain('a11y-about');
  });
});
