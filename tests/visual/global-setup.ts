import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
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

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function stopDevServer(dev: ChildProcess): Promise<void> {
  if (dev.pid === undefined || dev.exitCode !== null) return;
  const pid = dev.pid;
  const exited = new Promise<void>((resolve) => {
    if (dev.exitCode !== null) resolve();
    else dev.once('exit', () => resolve());
  });
  killProcessGroup(pid, 'SIGTERM');
  const escalate = setTimeout(() => killProcessGroup(pid, 'SIGKILL'), 3_000);
  try {
    await exited;
  } finally {
    clearTimeout(escalate);
  }
}

export default async function setup({ provide }: { provide: (key: string, value: string) => void }) {
  const port = await reserveLocalPort();
  const baseUrl = `http://localhost:${port}`;
  const logs: string[] = [];
  const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  // detached:true puts vite in its own process group so we can signal it
  // and any esbuild/worker children together via `process.kill(-pid, …)`.
  const dev = spawn(process.execPath, [viteBin, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  collectLogs(dev, logs);

  let browser: Browser | undefined;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      await browser?.close();
    } catch {}
    await stopDevServer(dev);
  };

  // Vitest's returned teardown only runs on a clean exit. Ctrl-C, vitest
  // crashes, and OOM kills all skip it — without these handlers the dev
  // server (and chromium) outlive the test run.
  const onAbort = () => {
    if (dev.pid !== undefined) killProcessGroup(dev.pid, 'SIGKILL');
    browser?.process()?.kill('SIGKILL');
  };
  process.once('SIGINT', onAbort);
  process.once('SIGTERM', onAbort);
  process.once('SIGHUP', onAbort);
  process.once('exit', onAbort);

  try {
    await waitForServer(`${baseUrl}/`);
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    provide('visualBaseUrl', baseUrl);
    provide('visualBrowserWSEndpoint', browser.wsEndpoint());

    return cleanup;
  } catch (error) {
    await cleanup();
    const logTail = logs.filter(Boolean).slice(-20).join('\n');
    throw new Error(
      `visual test harness failed to start at ${baseUrl}${logTail ? `\n${logTail}` : ''}`,
      { cause: error },
    );
  }
}
