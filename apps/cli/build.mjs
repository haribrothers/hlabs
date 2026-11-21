// Bundles the `hlabs` command into dist/cli.mjs, one file with its dependencies, which the Linux server tarball runs
// with its bundled Node (D-140).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Bundled CommonJS dependencies may still call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
