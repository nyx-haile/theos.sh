import { defineConfig } from 'vitest/config';
import { createRequire } from 'module';
import solid from 'vite-plugin-solid';

const require = createRequire(import.meta.url);
const libsodiumCjs = require.resolve('libsodium-wrappers');

export default defineConfig({
  plugins: [solid({ ssr: false })],
  resolve: {
    conditions: ['browser', 'development'],
    alias: {
      'libsodium-wrappers': libsodiumCjs,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'server/**/*.test.{ts,tsx}'],
    exclude: ['tests/integration/**', 'tests/visual/**', '**/node_modules/**'],
  },
});
