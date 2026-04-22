import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { createHash } from 'node:crypto';
import { openVisualPage, waitForTheos } from './harness';

let browser: Browser;
let page: Page;
let baseUrl: string;

function sha(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

describe('surface walk scene with effects visual', () => {
  beforeAll(async () => {
    ({ browser, page, baseUrl } = await openVisualPage({ width: 1024, height: 768 }));
  }, 30000);

  afterAll(async () => {
    await page?.close();
    browser?.disconnect();
  });

  it('walk frame is colored and deterministic for seed=bb', async () => {
    await page.goto(`${baseUrl}/surface/?seed=bb&testClock=1`, { waitUntil: 'domcontentloaded' });
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
