// `pnpm build:tray`: the unsigned hlabs.app with hlabsd inside (D-113). For the signed test update (phase 4, Done
// when #2) it can also build a version as an update, the way a release will be served (D-117, D-118):
//
//   pnpm build:tray --version 0.0.1                          the version to install and run
//   pnpm build:tray --version 0.0.2 --update                 a signed update: dist/updates/latest.json + its archive
//   pnpm build:tray --version 0.0.3 --update --broken        signed, but the archive won't install (it rolls back)
//   pnpm build:tray --version 0.0.4 --update --bad-signature signed with another key (it's refused)
//
// Updates are signed with the development key (~/.tauri/hlabs-dev.key, or TAURI_SIGNING_PRIVATE_KEY). Serve
// dist/updates (e.g. `python3 -m http.server 8090 -d dist/updates`) and start the app with
// HLABS_UPDATE_ENDPOINT=http://127.0.0.1:8090/latest.json; HLABS_UPDATE_BASE changes the archive's address. Builds
// from here may check over plain http (the Tauri updater refuses it otherwise in a release build).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tray = join(root, 'apps/tray');
const say = (line: string) => void process.stdout.write(`${line}\n`);
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const version =
  option('--version') ??
  (JSON.parse(readFileSync(join(root, 'apps/daemon/package.json'), 'utf8')) as { version: string }).version;
const update = flag('--update');
const devKey = join(homedir(), '.tauri', 'hlabs-dev.key');
const env: NodeJS.ProcessEnv = { ...process.env, HLABS_BUILD_VERSION: version };
if (update) {
  env.TAURI_SIGNING_PRIVATE_KEY ??= existsSync(devKey) ? readFileSync(devKey, 'utf8') : undefined;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
  if (!env.TAURI_SIGNING_PRIVATE_KEY)
    throw new Error(`No signing key: create ${devKey} or set TAURI_SIGNING_PRIVATE_KEY`);
}
const run = (cmd: string, argv: string[], cwd = root) => execFileSync(cmd, argv, { cwd, stdio: 'inherit', env });

say(`Building hlabs ${version}${update ? ' as an update' : ''}…`);
run('node', [join(root, 'scripts/bundle-app.ts')]);
run(
  'pnpm',
  [
    'exec',
    'tauri',
    'build',
    '--config',
    'src-tauri/tauri.bundle.json',
    '--config',
    // These builds check a local server over http (the release pipeline, phase 6, builds without this); what they
    // download must still be signed with the hlabs key.
    JSON.stringify({
      version,
      bundle: { createUpdaterArtifacts: update },
      plugins: { updater: { dangerousInsecureTransportProtocol: true } },
    }),
    '--bundles',
    'app',
  ],
  tray,
);
const bundleDir = join(tray, 'src-tauri/target/release/bundle/macos');
say(`hlabs.app: ${join(bundleDir, 'hlabs.app')}`);
if (!update) process.exit(0);

// The update: its archive and signature, and the manifest that names them.
const served = join(root, 'dist/updates');
const dir = join(served, version);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const archive = join(dir, 'hlabs.app.tar.gz');
copyFileSync(join(bundleDir, 'hlabs.app.tar.gz'), archive);
let signature = readFileSync(join(bundleDir, 'hlabs.app.tar.gz.sig'), 'utf8');
const sign = (key: string) => {
  run('pnpm', ['exec', 'tauri', 'signer', 'sign', '-k', key, '-p', '', archive], tray);
  return readFileSync(`${archive}.sig`, 'utf8');
};
if (flag('--broken')) {
  // Properly signed, but not an app: the tray's install fails after the daemon stopped, so it goes back.
  writeFileSync(archive, 'this is not an hlabs bundle');
  signature = sign(env.TAURI_SIGNING_PRIVATE_KEY!);
  say('The archive is broken on purpose (signed with the hlabs key).');
}
if (flag('--bad-signature')) {
  const keyDir = mkdtempSync(join(tmpdir(), 'hlabs-other-key-'));
  run('pnpm', ['exec', 'tauri', 'signer', 'generate', '--ci', '-p', '', '-w', join(keyDir, 'other.key')], tray);
  signature = sign(readFileSync(join(keyDir, 'other.key'), 'utf8'));
  rmSync(keyDir, { recursive: true, force: true });
  say('Signed with another key on purpose: it must be refused.');
}
const base = (process.env.HLABS_UPDATE_BASE ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const platform = `darwin-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`;
writeFileSync(
  join(served, 'latest.json'),
  `${JSON.stringify(
    {
      version,
      notes: `- Test update ${version}`,
      pub_date: new Date().toISOString(),
      platforms: { [platform]: { signature, url: `${base}/${version}/hlabs.app.tar.gz` } },
    },
    null,
    2,
  )}\n`,
);
say(`Update manifest: ${join(served, 'latest.json')} (serve ${served} on ${base})`);
