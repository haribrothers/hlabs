// The real install on a Linux runner (D-140): `pnpm build:linux` first, then `pnpm --filter @hlabs/cli test:install`.
// It needs root (through sudo), systemd and Docker, and changes the machine, so it runs only in CI's install job.
import { nodeTest } from '@hlabs/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...nodeTest,
    include: ['test/**/*.install.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
