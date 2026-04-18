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

  it('boots without console errors and renders non-empty output', async () => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto('http://localhost:3000/surface/?seed=2a', { waitUntil: 'domcontentloaded' });

    // Wait for a frame to render.
    await page.waitForFunction(() => {
      const pre = document.querySelector('pre');
      return pre && (pre.textContent?.length ?? 0) > 100;
    }, { timeout: 5000 });

    const initial = await page.$eval('pre', el => el.textContent ?? '');
    expect(initial.length).toBeGreaterThan(100);
    expect(errors).toEqual([]);

    // Press W for 500ms, assert frame content changed.
    await page.keyboard.down('w');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.up('w');
    const later = await page.$eval('pre', el => el.textContent ?? '');
    expect(later).not.toBe(initial);
    expect(errors).toEqual([]);
  }, 20000);
});
