import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/visual/**/*.test.ts'],
    globalSetup: ['tests/visual/global-setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
