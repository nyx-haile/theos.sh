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

describe('surface title scene visual', () => {
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

  it('title reveal hashes are deterministic for seed=aa at t=0.2s, t=3s, t=7s', async () => {
    const frames: string[] = [];
    await page.goto('http://localhost:3000/surface/?seed=aa', { waitUntil: 'domcontentloaded' });
    for (const wait of [200, 3000, 7000]) {
      await new Promise(r => setTimeout(r, wait));
      const buf = await page.screenshot({ type: 'png' });
      frames.push(sha(buf as Buffer));
    }
    expect(frames).toMatchInlineSnapshot(`
      [
        "fbb3bd747d61543a",
        "efc81b507cbb8226",
        "5058d622e11db172",
      ]
    `);
  }, 30000);
});
