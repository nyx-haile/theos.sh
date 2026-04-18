import { describe, it, expect } from 'vitest';
import { pickPipeline } from './pipeline-flag';

describe('pickPipeline', () => {
  it('returns "legacy" when no flag present', () => {
    expect(pickPipeline('https://theos.sh/')).toBe('legacy');
    expect(pickPipeline('https://theos.sh/?seed=abc')).toBe('legacy');
  });

  it('returns "surface" when ?pipeline=surface', () => {
    expect(pickPipeline('https://theos.sh/?pipeline=surface')).toBe('surface');
    expect(pickPipeline('https://theos.sh/?seed=abc&pipeline=surface')).toBe('surface');
  });

  it('returns "legacy" when flag set to another value', () => {
    expect(pickPipeline('https://theos.sh/?pipeline=legacy')).toBe('legacy');
    expect(pickPipeline('https://theos.sh/?pipeline=other')).toBe('legacy');
  });

  it('honors localStorage override when no URL flag', () => {
    const ls = new Map<string, string>([['theos:pipeline', 'surface']]);
    const store = { getItem: (k: string) => ls.get(k) ?? null };
    expect(pickPipeline('https://theos.sh/', store)).toBe('surface');
  });

  it('URL flag wins over localStorage', () => {
    const ls = new Map<string, string>([['theos:pipeline', 'surface']]);
    const store = { getItem: (k: string) => ls.get(k) ?? null };
    expect(pickPipeline('https://theos.sh/?pipeline=legacy', store)).toBe('legacy');
  });
});
