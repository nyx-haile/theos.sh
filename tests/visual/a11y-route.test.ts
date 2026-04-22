import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'puppeteer';
import { connectVisualBrowser, getVisualBaseUrl } from './harness';

let baseUrl: string;
let browser: Browser;

beforeAll(async () => {
  baseUrl = getVisualBaseUrl();
  browser = await connectVisualBrowser();
}, 60_000);

afterAll(async () => {
  browser?.disconnect();
});

describe('a11y routing', () => {
  it('/a11y/ renders with JS disabled', async () => {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(`${baseUrl}/a11y/`, { waitUntil: 'load' });
    const h1 = await page.$eval('h1', (el) => el.textContent?.trim() ?? '');
    expect(h1).toBe('theos.sh');
    await page.close();
  });

  it('/ redirects to /a11y/ under prefers-reduced-motion', async () => {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/a11y\/?$/);
    await page.close();
  });

  it('/ does not redirect when no a11y preference set', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/(\?|$)/);
    await page.close();
  });
});
