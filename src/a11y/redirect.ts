export const SKIP_REDIRECT_KEY = 'theos:skipA11yRedirect';

type MatchMediaLike = (q: string) => { matches: boolean };
type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>;

export function shouldRedirectToA11y(mm: MatchMediaLike, ss: StorageLike): { redirect: boolean } {
  if (ss.getItem(SKIP_REDIRECT_KEY) !== null) {
    ss.removeItem(SKIP_REDIRECT_KEY);
    return { redirect: false };
  }
  const reducedMotion = mm('(prefers-reduced-motion: reduce)').matches;
  const moreContrast  = mm('(prefers-contrast: more)').matches;
  return { redirect: reducedMotion || moreContrast };
}
