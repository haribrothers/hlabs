import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', manifest: 'src/manifest.ts', 'file-icons': 'src/file-icons/index.tsx' },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react/jsx-runtime', 'lucide-react', 'zod'],
});
