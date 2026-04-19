import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createHash } from 'node:crypto';
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

function sha(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function waitForTheos(page: Page, timeoutMs = 5000): Promise<void> {
  await page.waitForFunction(() => !!(window as any).theos?.test, { timeout: timeoutMs });
}

describe('surface walk scene with effects visual', () => {
  beforeAll(async () => {
    server = spawn('bun', ['run', 'dev'], { stdio: 'pipe', detached: false });
    await waitForServer('http://localhost:3000/surface/');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    if (server && !server.killed) server.kill('SIGTERM');
  });

  it('walk frame is colored and deterministic for seed=bb', async () => {
    await page.goto('http://localhost:3000/surface/?seed=bb&testClock=1', { waitUntil: 'domcontentloaded' });
    await waitForTheos(page);
    // Hold W for ~100ms (6 frames @ 16ms), then idle ~2500ms (156 frames).
    await page.evaluate(() => { (window as any).theos.test.setKey('w', true); });
    await page.evaluate(() => { (window as any).theos.test.step(6, 16); });
    await page.evaluate(() => { (window as any).theos.test.setKey('w', false); });
    await page.evaluate(() => { (window as any).theos.test.step(156, 16); });
    const buf = await page.screenshot({ type: 'png' });
    expect(sha(buf as Buffer)).toMatchSnapshot();
  }, 30000);
});
