import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pwaManifest, pwaWorkbox, PWA_THEME, shellOnly } from './src/pwa-options';
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

/**
 * Help links in development go to the local site (`pnpm dev:site`, Astro's default port, or HLABS_HELP_URL) until the
 * site is published (phase 6, Q-07). Builds and unit tests keep the public address.
 */
const helpUrlBase = (command: string) =>
  command === 'serve' && !process.env.VITEST
    ? JSON.stringify(process.env.HLABS_HELP_URL ?? 'http://localhost:4321')
    : 'null';

/** Where builds go: dist, or the folder given with --outDir (the e2e PWA build, dist-pwa). */
const outArg = process.argv.indexOf('--outDir');
const outDir = resolve(import.meta.dirname, outArg > 0 ? process.argv[outArg + 1]! : 'dist');

/** /trpc, /healthz, /api and the dev routes go to the daemon, in dev and in preview (the e2e PWA build). */
const toDaemon = {
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
  '/dev/fake-nas': DAEMON,
  '/dev/admin-password': DAEMON,
  '/dev/remove-app': DAEMON,
  '/dev/rolled-back': DAEMON,
  '/dev/sync-store': DAEMON,
  '/dev/seed': DAEMON,
  '/dev/fake-images': DAEMON,
  '/dev/trash-item': DAEMON,
  '/dev/notify': DAEMON,
  '/dev/log-line': DAEMON,
};

export default defineConfig(({ command }) => ({
  define: { __HLABS_PREVIEW_PHASE__: previewPhase(command), __HLABS_HELP_URL__: helpUrlBase(command) },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // index.html's theme-color: the window's title bar (a design token, not a hex there).
    { name: 'hlabs-theme-color', transformIndexHtml: (html: string) => html.replace('%HLABS_THEME%', PWA_THEME) },
    // The installable dashboard (US-INST-28): manifest and service worker in builds; main.tsx registers /sw.js.
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.webmanifest',
      manifest: pwaManifest,
      workbox: {
        ...pwaWorkbox,
        // The built index.html, read when the worker is made (after the page is written).
        manifestTransforms: [(entries) => shellOnly(readFileSync(join(outDir, 'index.html'), 'utf8'))(entries)],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // pnpm dev:full: Caddy sends https://hlabs.local and hlabs.home.arpa here (D-105), and Tailscale Serve sends the
    // tailnet name (<node>.<tailnet>.ts.net, US-SYS-02).
    allowedHosts: ['.local', '.home.arpa', '.ts.net'],
    proxy: toDaemon,
  },
  preview: { host: '127.0.0.1', strictPort: true, allowedHosts: ['.local', '.home.arpa', '.ts.net'], proxy: toDaemon },
  // lucide-react/dynamic (AppLogo) pre-bundled with lucide-react split every icon into a chunk of its own that the
  // icons then loaded at once: about 1,900 requests on every page, which left e2e pages blank. One chunk for them all.
  optimizeDeps: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'lucide-icons', test: /lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/]/ }] },
      },
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
