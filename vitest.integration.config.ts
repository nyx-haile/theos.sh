import { defineConfig } from 'vitest/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const libsodiumCjs = require.resolve('libsodium-wrappers');

export default defineConfig({
  resolve: {
    alias: {
      'libsodium-wrappers': libsodiumCjs,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.ts', 'server/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
