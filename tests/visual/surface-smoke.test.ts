import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { openVisualPage, waitForTheos } from './harness';

let browser: Browser;
let page: Page;
let baseUrl: string;

async function canvasNonEmpty(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const { width, height } = c;
    // Sample a sparse grid to avoid pulling the full pixel buffer.
    const step = 16;
    const data = ctx.getImageData(0, 0, width, height).data;
    let nonBg = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        if (r + g + b > 24) nonBg++;
      }
    }
    return nonBg > 10;
  });
}

async function canvasSnapshot(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return '';
    return c.toDataURL('image/png');
  });
}

describe('surface entry visual smoke', () => {
  beforeAll(async () => {
    ({ browser, page, baseUrl } = await openVisualPage());
  }, 30000);

  afterAll(async () => {
    await page?.close();
    browser?.disconnect();
  });

  it('boots without console errors and renders non-empty canvas', async () => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Ignore resource 404s (e.g. favicon); only catch JS errors.
      if (/Failed to load resource/.test(text)) return;
      errors.push(text);
    });

    await page.goto(`${baseUrl}/surface/?seed=2a&testClock=1`, { waitUntil: 'domcontentloaded' });
    await waitForTheos(page);

    // Advance one frame to let the renderer paint the canvas.
    await page.evaluate(() => { (window as any).theos.test.step(1, 16); });
    expect(await canvasNonEmpty(page)).toBe(true);
    expect(errors).toEqual([]);

    const initial = await canvasSnapshot(page);

    // Advance the retained title and torus animation by ~500ms.
    await page.evaluate(() => { (window as any).theos.test.step(31, 16); });
    const later = await canvasSnapshot(page);
    expect(later).not.toBe(initial);
    expect(errors).toEqual([]);
  }, 20000);
});
