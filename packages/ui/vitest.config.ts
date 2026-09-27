import { domTest } from '@hlabs/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { ...domTest, include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
