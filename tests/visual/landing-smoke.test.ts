import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openVisualPage } from './harness';

const UPDATE = process.env.UPDATE_VISUAL === '1';
const BASELINE = join(process.cwd(), 'tests', 'fixtures', 'landing-baseline.png');

let baseUrl: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  ({ baseUrl, browser, page } = await openVisualPage({ width: 1280, height: 720 }));
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 3000));
}, 60_000);

afterAll(async () => {
  await page?.close();
  browser?.disconnect();
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
