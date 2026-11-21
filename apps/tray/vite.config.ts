import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { BUILDING_PHASE } from '../../packages/shared/src/features';
import { defineConfig } from 'vite';

/** The phase `pnpm dev:tray` previews, as the dashboard's dev server does (D-092); builds show SHIPPED_PHASE. */
const previewPhase = (command: string) =>
  command === 'serve' && !process.env.VITEST
    ? JSON.stringify(process.env.HLABS_PREVIEW_PHASE ? Number(process.env.HLABS_PREVIEW_PHASE) : BUILDING_PHASE)
    : 'null';

// The tray window's UI (the macOS dropdown). Tauri loads it from this dev server or dist/.
export default defineConfig(({ command }) => ({
  define: { __HLABS_PREVIEW_PHASE__: previewPhase(command) },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { target: 'safari16', outDir: 'dist' },
}));
