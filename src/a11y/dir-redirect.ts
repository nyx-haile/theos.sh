/** Compute 301-style redirect target for bare sub-route paths that need a
 *  trailing slash. Shared by Vite dev plugin and the bun production server
 *  so bookmarks to /surface, /a11y, /hc don't fall through to the SPA or 404. */
export function needsDirRedirect(urlPath: string, knownDirs: readonly string[]): string | null {
  const [pathname, query] = urlPath.split('?', 2);
  if (!pathname || pathname === '/') return null;
  for (const dir of knownDirs) {
    if (pathname === `/${dir}`) {
      return query ? `/${dir}/?${query}` : `/${dir}/`;
    }
  }
  return null;
}

export const KNOWN_SUBDIRS = ['a11y', 'hc', 'surface'] as const;
