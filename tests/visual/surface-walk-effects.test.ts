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
    await page.goto(`${baseUrl}/surface/?seed=bb&testClock=1&title=classic`, { waitUntil: 'domcontentloaded' });
    await waitForTheos(page);
    await page.evaluate(() => { (window as any).theos.test.step(400, 16); });
    const buf = await page.screenshot({ type: 'png' });
    expect(sha(buf as Buffer)).toMatchSnapshot();
  }, 30000);

  it('honors the signature QA override with deterministic, distinct pixels', async () => {
    // Complete both titles immediately so this checks renderer pixels rather
    // than spending three six-second reveals in a browser integration test.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const capture = async (mode: 'classic' | 'signature') => {
      await page.goto(`${baseUrl}/surface/?seed=bb&testClock=1&title=${mode}`, {
        waitUntil: 'domcontentloaded',
      });
      await waitForTheos(page);
      await page.evaluate(() => { (window as any).theos.test.step(1, 16); });
      const state = await page.evaluate(() => ({
        requested: (window as any).theos.titlePolicy.variant,
        rendered: (window as any).theos.game.title.variant,
      }));
      const image = await page.screenshot({ type: 'png' });
      return { hash: sha(image as Buffer), state };
    };

    const classic = await capture('classic');
    const signature = await capture('signature');
    const signatureAgain = await capture('signature');
    expect(classic.state).toEqual({ requested: 'classic', rendered: 'classic' });
    expect(signature.state).toEqual({ requested: 'signature', rendered: 'signature' });
    expect(signatureAgain.hash).toBe(signature.hash);
    expect(signature.hash).not.toBe(classic.hash);
  }, 30000);

  it('renders the selected title fully revealed under reduced motion', async () => {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${baseUrl}/surface/?seed=bb&testClock=1&title=signature`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForTheos(page);
    const state = await page.evaluate(() => ({
      reveal: (window as any).theos.titlePolicy.reveal,
      revealTotalMs: (window as any).theos.game.title.revealTotalMs,
      rendered: (window as any).theos.game.title.variant,
    }));
    expect(state).toEqual({ reveal: 'complete', revealTotalMs: 0, rendered: 'signature' });
  }, 30000);
});
