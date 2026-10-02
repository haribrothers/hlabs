// Puts what the menu-bar app runs hlabsd with into apps/tray/src-tauri/resources/daemon (D-113): the node runtime, the
// daemon bundle and its npm modules (built for this computer), the built-in store, Caddy and docker compose, and the
// dashboard's builds. `pnpm build:tray` runs this and then `tauri build` with the bundle config, so the .app's
// Contents/Resources/daemon is this folder; the LaunchAgent runs `daemon/node daemon/hlabsd.mjs` (US-INST-01).
// Unsigned and for this computer's platform only: signing, notarizing and other platforms are the release (phase 6).
//
//   node scripts/bundle-app.ts
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'apps/tray/src-tauri/resources/daemon');
const say = (line: string) => void process.stdout.write(`${line}\n`);
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

say('Building the daemon and the dashboard…');
run('pnpm', ['--filter', '@hlabs/daemon...', '--filter', '@hlabs/web...', 'build']);

rmSync(out, { recursive: true, force: true, maxRetries: 5 });
mkdirSync(out, { recursive: true });

// The daemon's npm dependencies at the exact versions the workspace uses, in a flat node_modules (no symlinks in the
// app). Workspace packages are bundled into hlabsd.mjs, so they're left out. (`pnpm deploy` can't be used: published
// packages such as @trpc/server carry `catalog:` specs it tries to resolve.)
say('Collecting the daemon’s npm modules…');
interface Manifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}
const readManifest = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
const workspace = new Map(
  ['apps', 'packages'].flatMap((group) =>
    readdirSync(join(root, group))
      .map((name) => join(root, group, name))
      .filter((dir) => existsSync(join(dir, 'package.json')))
      .map((dir) => [readManifest(dir).name, dir] as const),
  ),
);
// Walk hlabsd's workspace packages (bundled into hlabsd.mjs) for the npm packages they import at run time.
const dependencies: Record<string, string> = {};
const seen = new Set<string>();
const collect = (name: string) => {
  if (seen.has(name)) return;
  seen.add(name);
  const dir = workspace.get(name)!;
  for (const dep of Object.keys(readManifest(dir).dependencies ?? {})) {
    if (workspace.has(dep)) collect(dep);
    else dependencies[dep] ??= readManifest(join(dir, 'node_modules', dep)).version;
  }
};
collect('@hlabs/daemon');
// Next to the output, so the move stays on one disk.
const deps = mkdtempSync(join(out, '..', '.deps-'));
try {
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { packageManager: string };
  writeFileSync(
    join(deps, 'package.json'),
    JSON.stringify({
      name: 'hlabsd-bundle',
      private: true,
      packageManager: rootManifest.packageManager,
      dependencies,
      // Only better-sqlite3 builds (or downloads) its native module; argon2 and keyring ship prebuilt packages, and
      // ssh2's optional cpu-features isn't needed.
      pnpm: { onlyBuiltDependencies: ['better-sqlite3'] },
    }),
  );
  writeFileSync(join(deps, '.npmrc'), 'node-linker=hoisted\n');
  execFileSync('pnpm', ['install', '--prod', '--ignore-workspace', '--no-frozen-lockfile'], {
    cwd: deps,
    stdio: 'inherit',
  });
  renameSync(join(deps, 'node_modules'), join(out, 'node_modules'));
} finally {
  rmSync(deps, { recursive: true, force: true });
}

const daemonDist = join(root, 'apps/daemon/dist');
for (const file of ['hlabsd.mjs', 'hlabsd.mjs.map']) cpSync(join(daemonDist, file), join(out, file));
cpSync(join(daemonDist, 'migrations'), join(out, 'migrations'), { recursive: true });
cpSync(join(root, 'store'), join(out, 'store'), { recursive: true });
cpSync(join(root, 'apps/web/dist'), join(out, 'web'), { recursive: true });
cpSync(join(root, 'apps/web/dist-fallback'), join(out, 'web-fallback'), { recursive: true });

say('Fetching the bundled binaries…');
run('node', ['scripts/fetch-binaries.ts', '--packaging', '--out', join(out, 'bin')]);
renameSync(join(out, 'bin', 'node'), join(out, 'node'));
rmSync(join(out, 'bin', 'versions.json'), { force: true });

for (const required of [
  'node',
  'hlabsd.mjs',
  'migrations',
  'node_modules',
  'store',
  'web',
  'web-fallback',
  'bin/caddy',
]) {
  if (!existsSync(join(out, required))) throw new Error(`The bundle is missing ${required}`);
}
say(`The daemon bundle is in ${out}`);
