import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const html = readFileSync(join(process.cwd(), 'a11y/index.html'), 'utf8');

describe('a11y/index.html', () => {
  const { window } = new JSDOM(html);
  const d = window.document;

  it('has <h1>theos.sh</h1>', () => {
    expect(d.querySelector('h1')?.textContent?.trim()).toBe('theos.sh');
  });
  it('has About, The Game, Artifacts sections', () => {
    const headings = [...d.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(expect.arrayContaining(['About', 'The Game', 'Artifacts']));
  });
  it('links to the github profile', () => {
    const links = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining([expect.stringContaining('github.com/nyx-haile')]));
  });
  it('links to the resume release', () => {
    const links = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining([expect.stringContaining('releases/tag/resume')]));
  });
  it('footer has /hc/ and / links', () => {
    const footer = d.querySelector('footer');
    const links = [...(footer?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/hc/', '/']));
  });
  it('page is usable without JS (no critical behavior in <script>)', () => {
    const scripts = [...d.querySelectorAll('script')];
    // A small inline click-handler script is allowed, but removing all scripts must not remove headings/links.
    scripts.forEach((s) => s.remove());
    expect(d.querySelector('h1')).toBeTruthy();
    expect(d.querySelector('footer a[href="/"]')).toBeTruthy();
  });
});
