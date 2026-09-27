// Shared Vitest defaults. Packages merge these into their own vitest.config.ts.
export const nodeTest = {
  environment: 'node',
  include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  restoreMocks: true,
};

export const domTest = {
  environment: 'jsdom',
  globals: true,
  include: ['src/**/*.test.{ts,tsx}'],
  restoreMocks: true,
};
