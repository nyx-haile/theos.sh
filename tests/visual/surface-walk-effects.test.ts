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

describe('title and torus scene visual', () => {
  beforeAll(async () => {
    ({ browser, page, baseUrl } = await openVisualPage({ width: 1024, height: 768 }));
  }, 30000);

  afterAll(async () => {
    await page?.close();
    browser?.disconnect();
  });

  it('is colored and deterministic for seed=bb', async () => {
    await page.goto(`${baseUrl}/surface/?seed=bb&testClock=1`, { waitUntil: 'domcontentloaded' });
    await waitForTheos(page);
    await page.evaluate(() => { (window as any).theos.test.step(400, 16); });
    const buf = await page.screenshot({ type: 'png' });
    expect(sha(buf as Buffer)).toMatchSnapshot();
  }, 30000);
});
