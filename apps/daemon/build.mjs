// Bundles hlabsd into dist/hlabsd.mjs. Workspace packages (@hlabs/*, TypeScript source) are bundled;
// npm packages stay external and ship in node_modules (native modules and pino transports need their files).
// The db migrations folder is copied next to the bundle.
import { build } from 'esbuild';
import { cpSync, readFileSync } from 'node:fs';

// HLABS_BUILD_VERSION: the version `pnpm build:tray --version` builds (the signed test update, phase 4).
const version = process.env.HLABS_BUILD_VERSION ?? JSON.parse(readFileSync('package.json', 'utf8')).version;

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/hlabsd.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  define: { __HLABS_BUNDLE__: 'true', __HLABS_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
  plugins: [
    {
      name: 'external-npm',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@hlabs/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});

cpSync('../../packages/db/migrations', 'dist/migrations', { recursive: true });
