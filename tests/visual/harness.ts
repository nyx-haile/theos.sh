import puppeteer, { type Browser, type Page, type Viewport } from 'puppeteer';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    visualBaseUrl: string;
    visualBrowserWSEndpoint: string;
  }
}

export function getVisualBaseUrl(): string {
  return inject('visualBaseUrl');
}

export async function connectVisualBrowser(): Promise<Browser> {
  return await puppeteer.connect({
    browserWSEndpoint: inject('visualBrowserWSEndpoint'),
  });
}

export async function openVisualPage(
  viewport?: Viewport,
): Promise<{ baseUrl: string; browser: Browser; page: Page }> {
  const browser = await connectVisualBrowser();
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  return {
    baseUrl: getVisualBaseUrl(),
    browser,
    page,
  };
}

export async function waitForTheos(page: Page, timeoutMs = 5_000): Promise<void> {
  await page.waitForFunction(() => !!(window as any).theos?.test, { timeout: timeoutMs });
}
