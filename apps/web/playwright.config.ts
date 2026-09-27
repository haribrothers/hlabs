import { defineConfig, devices } from '@playwright/test';

// E2E specs are named by user story id (us-<code>-<nn>.spec.ts); phase checks by phase.
// Locally they reuse a running `pnpm dev`; in CI Playwright starts the daemon and Vite itself.
const DATA_DIR = process.env.HLABS_E2E_DATA_DIR ?? '../../.e2e-data';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `pnpm --filter @hlabs/daemon exec tsx src/main.ts`,
      url: 'http://127.0.0.1:7474/healthz',
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'development',
        HLABS_DEV_ANONYMOUS_ADMIN: '1',
        HLABS_DATA_DIR: DATA_DIR,
        HLABS_LOG_LEVEL: 'warn',
      },
      timeout: 60_000,
    },
    {
      command: 'pnpm exec vite --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
