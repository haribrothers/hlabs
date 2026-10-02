import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { BUILDING_PHASE } from '../../packages/shared/src/features';

/** The dev daemon (pnpm dev). The dashboard talks to it directly; Caddy comes with pnpm dev:full. */
const DAEMON = process.env.HLABS_DAEMON_URL ?? 'http://127.0.0.1:7474';

/**
 * The dev server previews the phase being built (BUILDING_PHASE, or HLABS_PREVIEW_PHASE): its controls show in
 * pnpm dev and e2e (D-092). Builds and unit tests show what has shipped.
 */
const previewPhase = (command: string) =>
  command === 'serve' && !process.env.VITEST
    ? JSON.stringify(process.env.HLABS_PREVIEW_PHASE ? Number(process.env.HLABS_PREVIEW_PHASE) : BUILDING_PHASE)
    : 'null';

export default defineConfig(({ command }) => ({
  define: { __HLABS_PREVIEW_PHASE__: previewPhase(command) },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // pnpm dev:full: Caddy sends https://hlabs.local here.
    allowedHosts: ['.local'],
    proxy: {
      '/trpc': { target: DAEMON, changeOrigin: false },
      '/healthz': DAEMON,
      '/api': DAEMON,
      '/dev/emit-test-event': DAEMON,
      '/dev/setup-url': DAEMON,
      '/dev/complete-onboarding': DAEMON,
      '/dev/reset-onboarding': DAEMON,
      '/dev/sign-in': DAEMON,
      '/dev/revoke-sessions': DAEMON,
      '/dev/fake-app': DAEMON,
      '/dev/engine': DAEMON,
      '/dev/tailscale': DAEMON,
      '/dev/remove-app': DAEMON,
      '/dev/rolled-back': DAEMON,
      '/dev/sync-store': DAEMON,
      '/dev/seed': DAEMON,
      '/dev/notify': DAEMON,
    },
  },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
}));
