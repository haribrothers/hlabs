import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** The dev daemon (pnpm dev). The dashboard talks to it directly; Caddy comes with pnpm dev:full. */
const DAEMON = process.env.HLABS_DAEMON_URL ?? 'http://127.0.0.1:7474';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/trpc': { target: DAEMON, changeOrigin: false },
      '/healthz': DAEMON,
      '/dev/emit-test-event': DAEMON,
      '/dev/setup-url': DAEMON,
      '/dev/complete-onboarding': DAEMON,
      '/dev/reset-onboarding': DAEMON,
      '/dev/sign-in': DAEMON,
      '/dev/revoke-sessions': DAEMON,
    },
  },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
