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
    await page.goto('http://localhost:3000/surface/?seed=bb', { waitUntil: 'domcontentloaded' });
    await page.keyboard.down('w');
    await new Promise(r => setTimeout(r, 100));
    await page.keyboard.up('w');
    await new Promise(r => setTimeout(r, 2500));
    const buf = await page.screenshot({ type: 'png' });
    expect(sha(buf as Buffer)).toMatchInlineSnapshot(`"f28c1c983ccb0476"`);
  }, 30000);
});
