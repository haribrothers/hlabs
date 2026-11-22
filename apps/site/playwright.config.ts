import { defineConfig, devices } from '@playwright/test';

// The website's stories (us-site-<nn>.spec.ts) against the site built by e2e/build.ts, served by e2e/serve.ts on a
// port of its own. Run with `pnpm site:e2e` from the repo root.
const PORT = 4521;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /us-site-(01|02|12)\.spec\.ts/ },
  ],
  webServer: {
    command: `node e2e/serve.ts ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
