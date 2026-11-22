import { defineConfig, devices } from '@playwright/test';

// The website's stories (us-site-<nn>.spec.ts) against the site built by e2e/build.ts, served by e2e/serve.ts on a
// port of its own. Run with `pnpm site:e2e` from the repo root.
// The beta-only site is on PORT + 1 (helpers.ts, BETA_ONLY_URL).
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
  webServer: [
    { command: `node e2e/serve.ts ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: !process.env.CI },
    // The site before the first stable release: only a beta.
    {
      command: `node e2e/serve.ts ${PORT + 1} dist-e2e-beta`,
      url: `http://127.0.0.1:${PORT + 1}/`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
