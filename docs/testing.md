# Testing

Safe defaults for local runs:

- `bun run test:run` — default unit suite
- `bun run test:integration` — bounded integration suite
- `bun run test:visual` — serialized visual suite with one shared dev server/browser harness

Run a single heavy file when iterating locally:

- `bun run test:integration -- tests/integration/golden-frames.test.ts`
- `bun run test:visual -- tests/visual/game-flow.test.ts`

The visual suite is intentionally serialized to keep local memory usage bounded.
