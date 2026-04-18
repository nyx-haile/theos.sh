import { describe, it, expect } from 'vitest';
import { needsDirRedirect } from './dir-redirect';

const DIRS = ['a11y', 'hc', 'surface'];

describe('needsDirRedirect', () => {
  it('returns redirect target for bare sub-route', () => {
    expect(needsDirRedirect('/surface', DIRS)).toBe('/surface/');
    expect(needsDirRedirect('/a11y', DIRS)).toBe('/a11y/');
    expect(needsDirRedirect('/hc', DIRS)).toBe('/hc/');
  });

  it('returns null when trailing slash already present', () => {
    expect(needsDirRedirect('/surface/', DIRS)).toBeNull();
    expect(needsDirRedirect('/a11y/', DIRS)).toBeNull();
  });

  it('returns null for / root', () => {
    expect(needsDirRedirect('/', DIRS)).toBeNull();
  });

  it('returns null for unknown paths', () => {
    expect(needsDirRedirect('/unknown', DIRS)).toBeNull();
    expect(needsDirRedirect('/favicon.ico', DIRS)).toBeNull();
  });

  it('returns null for nested paths under known dirs', () => {
    expect(needsDirRedirect('/surface/foo.js', DIRS)).toBeNull();
    expect(needsDirRedirect('/a11y/index.html', DIRS)).toBeNull();
  });

  it('preserves query string in redirect target', () => {
    expect(needsDirRedirect('/surface?seed=2a', DIRS)).toBe('/surface/?seed=2a');
    expect(needsDirRedirect('/a11y?x=1&y=2', DIRS)).toBe('/a11y/?x=1&y=2');
  });
});
