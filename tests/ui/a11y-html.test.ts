import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const shells = [
  'index.html',
  'surface/index.html',
  'a11y/index.html',
  'hc/index.html',
];

describe.each(shells)('%s', (path) => {
  const html = readFileSync(join(process.cwd(), path), 'utf8');
  const document = new JSDOM(html).window.document;

  it('contains no static text or document title', () => {
    expect(document.title).toBe('');
    expect(document.body.textContent?.trim()).toBe('');
  });

  it('contains only an empty mount point and module entry', () => {
    expect([...document.body.children].map((element) => element.tagName)).toEqual(['DIV', 'SCRIPT']);
    expect(document.body.querySelector('div')?.childNodes).toHaveLength(0);
    expect(document.body.querySelector('script[type="module"]')).toBeTruthy();
    expect(document.body.querySelector('a, button, input, nav, main, header, footer')).toBeNull();
  });
});
