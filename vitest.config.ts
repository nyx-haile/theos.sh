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
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['tests/integration/**', 'tests/visual/**', '**/node_modules/**'],
  },
});
