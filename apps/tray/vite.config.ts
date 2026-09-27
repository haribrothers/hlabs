import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The tray window's UI (the macOS dropdown). Tauri loads it from this dev server or dist/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { target: 'safari16', outDir: 'dist' },
});
