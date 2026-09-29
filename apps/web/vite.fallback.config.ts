// Builds the fallback page (US-STATE-04) into dist-fallback/: one index.html with its script, styles and fonts
// inlined (scripts/inline-fallback.mjs), for Caddy to serve from <appResources>/web-fallback/ when the daemon is down.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'fallback'),
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist-fallback'),
    emptyOutDir: true,
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    modulePreload: false,
  },
});
