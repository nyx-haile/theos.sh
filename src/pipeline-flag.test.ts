import { describe, it, expect } from 'vitest';
import { pickPipeline } from './pipeline-flag';

describe('pickPipeline', () => {
  it('returns "surface" when no flag present', () => {
    expect(pickPipeline('https://theos.sh/')).toBe('surface');
    expect(pickPipeline('https://theos.sh/?seed=abc')).toBe('surface');
  });

  it('returns "legacy" when ?pipeline=legacy', () => {
    expect(pickPipeline('https://theos.sh/?pipeline=legacy')).toBe('legacy');
    expect(pickPipeline('https://theos.sh/?seed=abc&pipeline=legacy')).toBe('legacy');
  });

  it('returns "surface" for ?pipeline=surface or unknown values', () => {
    expect(pickPipeline('https://theos.sh/?pipeline=surface')).toBe('surface');
    expect(pickPipeline('https://theos.sh/?pipeline=other')).toBe('surface');
  });

  it('honors localStorage override when no URL flag', () => {
    const ls = new Map<string, string>([['theos:pipeline', 'legacy']]);
    const store = { getItem: (k: string) => ls.get(k) ?? null };
    expect(pickPipeline('https://theos.sh/', store)).toBe('legacy');
  });

  it('URL flag wins over localStorage', () => {
    const ls = new Map<string, string>([['theos:pipeline', 'legacy']]);
    const store = { getItem: (k: string) => ls.get(k) ?? null };
    expect(pickPipeline('https://theos.sh/?pipeline=surface', store)).toBe('surface');
  });
});
