import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 3738;
let dev: ChildProcess; let browser: Browser;

beforeAll(async () => {
  dev = spawn('bun', ['run', 'dev', '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise<void>((resolve) => {
    dev.stdout?.on('data', (b: Buffer) => { if (b.toString().includes('ready')) resolve(); });
  });
  browser = await puppeteer.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  dev?.kill('SIGTERM');
});

describe('a11y routing', () => {
  it('/a11y/ renders with JS disabled', async () => {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(`http://localhost:${PORT}/a11y/`, { waitUntil: 'load' });
    const h1 = await page.$eval('h1', (el) => el.textContent?.trim() ?? '');
    expect(h1).toBe('theos.sh');
    await page.close();
  });

  it('/ redirects to /a11y/ under prefers-reduced-motion', async () => {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/a11y\/?$/);
    await page.close();
  });

  it('/ does not redirect when no a11y preference set', async () => {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/(\?|$)/);
    await page.close();
  });
});
