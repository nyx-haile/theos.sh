import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { connectVisualBrowser, getVisualBaseUrl } from './harness';

let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  baseUrl = getVisualBaseUrl();
  browser = await connectVisualBrowser();
}, 30_000);

afterAll(async () => {
  browser?.disconnect();
});

describe('canvas-only scene', () => {
  it('ignores input without revealing text UI', async () => {
    const page: Page = await browser.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await page.$('canvas')).toBeTruthy();
    const poseBefore = await page.evaluate(() => JSON.stringify((window as any).theos.game.player.pose));
    await page.keyboard.down('w');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await page.keyboard.up('w');
    await page.keyboard.press('Enter');
    const poseAfter = await page.evaluate(() => JSON.stringify((window as any).theos.game.player.pose));

    expect(poseAfter).toBe(poseBefore);
    expect(await page.$eval('body', (element) => element.innerText.trim())).toBe('');
    expect(await page.$('a, button, input, [data-testid="proximity-hint"], [data-testid="detail-view"]')).toBeNull();
    await page.close();
  }, 20_000);
});
