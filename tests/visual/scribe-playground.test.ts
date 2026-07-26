import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { connectVisualBrowser, getVisualBaseUrl } from './harness';

let baseUrl: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  baseUrl = getVisualBaseUrl();
  browser = await connectVisualBrowser();
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
}, 60_000);

afterAll(async () => {
  await page?.close();
  browser?.disconnect();
});

describe('Scribe playground', () => {
  it('redirects the bare nested route and preserves its seed', async () => {
    await page.goto(`${baseUrl}/playground/scribe?seed=2a`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid="scribe-stage"]');
    expect(page.url()).toContain('/playground/scribe/?seed=');
    expect(new URL(page.url()).searchParams.get('seed')).toBe(`2a${'0'.repeat(62)}`);
  });

  it('renders aria-hidden ink over real logical-order text', async () => {
    expect(await page.$eval('[data-testid="scribe-ink"]', (node) => node.getAttribute('aria-hidden'))).toBe('true');
    expect(await page.$eval('[data-testid="scribe-semantic-text"]', (node) => node.textContent)).toBe('llelle');
    expect(await page.$$eval('[data-scribe-token]', (nodes) => nodes.length)).toBe(6);
    expect(await page.$$eval('[data-stroke]', (nodes) => nodes.length)).toBeGreaterThan(0);
  });

  it('applies specimen presets and keeps rerolled seeds shareable', async () => {
    const labels = await page.$$eval('.scribe-presets button', (buttons) =>
      buttons.map((button) => button.textContent),
    );
    expect(labels).toEqual(['llelle', 'hello hello', 'theos.sh']);

    await page.$$eval('.scribe-presets button', (buttons) => {
      const preset = buttons.find((button) => button.textContent === 'theos.sh');
      (preset as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="scribe-semantic-text"]')?.textContent === 'theos.sh',
    );

    const before = new URL(page.url()).searchParams.get('seed');
    await page.click('[data-testid="scribe-reroll"]');
    await page.waitForFunction((oldSeed) =>
      new URL(location.href).searchParams.get('seed') !== oldSeed,
      {},
      before,
    );
    expect(new URL(page.url()).searchParams.get('seed')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('updates from a normal input and preserves exact native selection text', async () => {
    await page.$eval('[data-testid="scribe-input"]', (node) => {
      const input = node as HTMLInputElement;
      input.value = ' hello hello ';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' hello hello ' }));
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="scribe-semantic-text"]')?.textContent === ' hello hello ');

    const result = await page.evaluate(() => {
      const spans = [...document.querySelectorAll<HTMLElement>('[data-scribe-token]')];
      const range = document.createRange();
      range.setStart(spans[0]!.firstChild!, 0);
      range.setEnd(spans.at(-1)!.firstChild!, spans.at(-1)!.textContent!.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      const first = spans[0]!;
      const last = spans.at(-1)!;
      return {
        text: selection.toString(),
        firstLeft: Number.parseFloat(first.style.left),
        lastRight: Number.parseFloat(last.style.left) + Number.parseFloat(last.style.width),
      };
    });

    expect(result.text).toBe(' hello hello ');
    expect(result.firstLeft).toBeGreaterThanOrEqual(0);
    expect(result.lastRight).toBeLessThanOrEqual(100);
    await page.waitForFunction(() => document.querySelectorAll('[data-selected-token]').length > 0);
    expect(await page.$$eval('[data-selected-token]', (nodes) => nodes.length)).toBeGreaterThan(0);
  });

  it('switches optical profiles across the supported size range', async () => {
    await page.$eval('[data-testid="scribe-size"]', (node) => {
      const input = node as HTMLInputElement;
      input.value = '18';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.scribe-stage-meta')?.textContent?.includes('micro profile'));

    await page.$eval('[data-testid="scribe-size"]', (node) => {
      const input = node as HTMLInputElement;
      input.value = '180';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.scribe-stage-meta')?.textContent?.includes('display profile'));
  });
});
