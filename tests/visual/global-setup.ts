import { spawn, type ChildProcess } from 'node:child_process';
import puppeteer, { type Browser } from 'puppeteer';
import { reserveLocalPort, waitForServer } from './shared';

function collectLogs(child: ChildProcess, lines: string[]): void {
  child.stdout?.on('data', (chunk: Buffer | string) => {
    lines.push(String(chunk).trim());
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    lines.push(String(chunk).trim());
  });
}

async function stopDevServer(dev: ChildProcess): Promise<void> {
  if (dev.exitCode !== null || dev.killed) return;
  dev.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    dev.once('exit', () => resolve());
    setTimeout(resolve, 2_000);
  });
}

export default async function setup({ provide }: { provide: (key: string, value: string) => void }) {
  const port = await reserveLocalPort();
  const baseUrl = `http://localhost:${port}`;
  const logs: string[] = [];
  const dev = spawn('bun', ['run', 'dev', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  collectLogs(dev, logs);

  let browser: Browser | undefined;
  try {
    await waitForServer(`${baseUrl}/`);
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    provide('visualBaseUrl', baseUrl);
    provide('visualBrowserWSEndpoint', browser.wsEndpoint());

    return async () => {
      await browser?.close();
      await stopDevServer(dev);
    };
  } catch (error) {
    await browser?.close();
    await stopDevServer(dev);
    const logTail = logs.filter(Boolean).slice(-20).join('\n');
    throw new Error(
      `visual test harness failed to start at ${baseUrl}${logTail ? `\n${logTail}` : ''}`,
      { cause: error },
    );
  }
}
