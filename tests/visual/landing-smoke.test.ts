import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 3737;
const UPDATE = process.env.UPDATE_VISUAL === '1';
const BASELINE = join(process.cwd(), 'tests', 'fixtures', 'landing-baseline.png');

let dev: ChildProcess; let browser: Browser; let page: Page;

beforeAll(async () => {
  dev = spawn('bun', ['run', 'dev', '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise<void>((resolve) => {
    const onData = (buf: Buffer) => { if (buf.toString().includes('ready')) resolve(); };
    dev.stdout?.on('data', onData);
  });
  browser = await puppeteer.launch();
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 3000));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  dev?.kill('SIGTERM');
});

describe('landing smoke', () => {
  it('captures the landing page', async () => {
    const png = await page.screenshot({ type: 'png' });
    if (UPDATE || !existsSync(BASELINE)) { writeFileSync(BASELINE, png); return; }
    const baseline = readFileSync(BASELINE);
    expect(png.length).toBeGreaterThan(10_000);
    expect(Math.abs(png.length - baseline.length) / baseline.length).toBeLessThan(0.8);
  });
});
