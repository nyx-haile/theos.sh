import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

describe('Scribe HTML entry', () => {
  const html = readFileSync(join(process.cwd(), 'playground/scribe/index.html'), 'utf8');
  const document = new JSDOM(html).window.document;

  it('has one empty mount point and its dedicated module entry', () => {
    expect(document.body.children).toHaveLength(2);
    expect(document.querySelector('#scribe-root')?.childNodes).toHaveLength(0);
    expect(document.querySelector('script[type="module"]')?.getAttribute('src'))
      .toBe('/src/scribe-playground-entry.tsx');
  });

  it('has route-specific metadata without static fallback controls', () => {
    expect(document.title).toBe('Scribe — theos.sh');
    expect(document.body.querySelector('button, input, main, nav')).toBeNull();
  });
});
