import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';

let server: ChildProcess;
let browser: Browser;
let page: Page;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not start in ${timeoutMs}ms`);
}

async function waitForTheos(page: Page, timeoutMs = 5000): Promise<void> {
  await page.waitForFunction(() => !!(window as any).theos?.test, { timeout: timeoutMs });
}

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
    server = spawn('bun', ['run', 'dev'], { stdio: 'pipe', detached: false });
    await waitForServer('http://localhost:3000/surface/');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
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

    await page.goto('http://localhost:3000/surface/?seed=2a&testClock=1', { waitUntil: 'domcontentloaded' });
    await waitForTheos(page);

    // Advance one frame to let the renderer paint the canvas.
    await page.evaluate(() => { (window as any).theos.test.step(1, 16); });
    expect(await canvasNonEmpty(page)).toBe(true);
    expect(errors).toEqual([]);

    const initial = await canvasSnapshot(page);

    // Press W for ~500ms (31 frames @ 16ms), assert canvas changed.
    await page.evaluate(() => { (window as any).theos.test.setKey('w', true); });
    await page.evaluate(() => { (window as any).theos.test.step(31, 16); });
    await page.evaluate(() => { (window as any).theos.test.setKey('w', false); });
    const later = await canvasSnapshot(page);
    expect(later).not.toBe(initial);
    expect(errors).toEqual([]);
  }, 20000);
});
