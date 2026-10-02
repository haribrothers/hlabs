// Builds the fallback page (US-STATE-04) into dist-fallback/: one index.html with its script, styles and fonts
// inlined (scripts/inline-fallback.mjs), for Caddy to serve from <appResources>/web-fallback/ when the daemon is down.
// With HLABS_FALLBACK_PAGE=pages it builds pages.html next to it: the daemon's pages for app hostnames (US-AUTH-17).
// One entry per build, so each page gets a single script to inline.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = process.env.HLABS_FALLBACK_PAGE === 'pages' ? 'pages' : 'index';

export default defineConfig({
  root: resolve(import.meta.dirname, 'fallback'),
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist-fallback'),
    emptyOutDir: page === 'index',
    rollupOptions: { input: resolve(import.meta.dirname, 'fallback', `${page}.html`) },
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    modulePreload: false,
  },
});
