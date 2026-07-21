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
  it('/a11y/ contains no fallback text with JS disabled', async () => {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(`${baseUrl}/a11y/`, { waitUntil: 'load' });
    const text = await page.$eval('body', (el) => el.textContent?.trim() ?? '');
    expect(text).toBe('');
    await page.close();
  });

  it('/ keeps the canvas-only animation under prefers-reduced-motion', async () => {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/(\?|$)/);
    expect(await page.$('canvas')).toBeTruthy();
    expect(await page.$eval('body', (el) => el.innerText.trim())).toBe('');
    await page.close();
  });

  it.each(['/', '/surface/', '/a11y/', '/hc/'])('%s renders only the canvas', async (path) => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' });
    expect(await page.$('canvas')).toBeTruthy();
    expect(await page.$eval('body', (el) => el.innerText.trim())).toBe('');
    expect(await page.$('a, button, input, nav, main, header, footer')).toBeNull();
    await page.close();
  });
});
