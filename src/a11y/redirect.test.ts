import { describe, it, expect } from 'vitest';
import { shouldRedirectToA11y } from './redirect';

function mm(map: Record<string, boolean>): (q: string) => { matches: boolean } {
  return (q) => ({ matches: !!map[q] });
}
function ss(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size; },
  };
}

describe('shouldRedirectToA11y', () => {
  it('no prefs, no flag → no redirect', () => {
    expect(shouldRedirectToA11y(mm({}), ss()).redirect).toBe(false);
  });
  it('prefers-reduced-motion → redirect', () => {
    expect(shouldRedirectToA11y(mm({ '(prefers-reduced-motion: reduce)': true }), ss()).redirect).toBe(true);
  });
  it('prefers-contrast more → redirect', () => {
    expect(shouldRedirectToA11y(mm({ '(prefers-contrast: more)': true }), ss()).redirect).toBe(true);
  });
  it('escape flag set → no redirect and flag is cleared', () => {
    const store = ss();
    store.setItem('theos:skipA11yRedirect', '1');
    const r = shouldRedirectToA11y(mm({ '(prefers-reduced-motion: reduce)': true }), store);
    expect(r.redirect).toBe(false);
    expect(store.getItem('theos:skipA11yRedirect')).toBe(null);
  });
});
