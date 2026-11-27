// Shared Vitest defaults. Packages merge these into their own vitest.config.ts.
import { fileURLToPath } from 'node:url';

// Each run gets its own temp folder, removed at the end (see vitest-tmpdir.js).
const globalSetup = [fileURLToPath(new URL('./vitest-tmpdir.js', import.meta.url))];

export const nodeTest = {
  environment: 'node',
  include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  restoreMocks: true,
  globalSetup,
};

export const domTest = {
  environment: 'jsdom',
  globals: true,
  include: ['src/**/*.test.{ts,tsx}'],
  restoreMocks: true,
  globalSetup,
};
