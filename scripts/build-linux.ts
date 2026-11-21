// `pnpm build:linux`: the Linux server download (D-140) for this computer's architecture, run on Linux (the daemon's
// npm modules are built for the machine that bundles them):
//
//   dist/linux/hlabs-<v>-linux-<x86_64|aarch64>.tar.gz   hlabsd and its bundle, Node, caddy, restic, compose, the
//                                                        `hlabs` command, hlabs-priv, hlabsd.service and `version`
//   dist/linux/SHA256SUMS                                its checksum
//   dist/linux/install.sh                                the installer, with the public key written in (also in
//                                                        the tarball, for `hlabs uninstall`)
//   *.sig                                                signatures of each, by the update key (D-141)
//
//   pnpm build:linux [--version <v>]
//
// The signing key is TAURI_SIGNING_PRIVATE_KEY (and _PASSWORD), as for updates; without it a key is made for this
// build (dist/linux/build.key), so a local install checks a real signature. Install it with
//   sudo HLABS_TARBALL=dist/linux/hlabs-<v>-linux-<arch>.tar.gz sh dist/linux/install.sh
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist/linux');
const say = (line: string) => void process.stdout.write(`${line}\n`);

const { values } = parseArgs({ options: { version: { type: 'string' } } });
const version =
  values.version ??
  (JSON.parse(readFileSync(join(root, 'apps/daemon/package.json'), 'utf8')) as { version: string }).version;
if (process.platform !== 'linux') throw new Error('pnpm build:linux runs on Linux (the bundle is built for it).');
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const env: NodeJS.ProcessEnv = { ...process.env, HLABS_BUILD_VERSION: version };
const run = (cmd: string, args: string[], cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit', env });

rmSync(out, { recursive: true, force: true });
const stage = join(out, `hlabs-${version}`);
mkdirSync(out, { recursive: true });

say(`Building hlabs ${version} for Linux ${arch}…`);
run('node', [join(root, 'scripts/bundle-app.ts'), '--out', stage]);
run('pnpm', ['--filter', '@hlabs/cli', 'build']);
copyFileSync(join(root, 'apps/cli/dist/cli.mjs'), join(stage, 'cli.mjs'));
for (const [from, to] of [
  ['scripts/linux/hlabs', 'bin/hlabs'],
  ['apps/daemon/native/hlabs-priv', 'bin/hlabs-priv'],
]) {
  copyFileSync(join(root, from), join(stage, to));
  chmodSync(join(stage, to), 0o755);
}
copyFileSync(join(root, 'scripts/linux/hlabsd.service'), join(stage, 'hlabsd.service'));
writeFileSync(join(stage, 'version'), `${version}\n`);
for (const required of ['node', 'hlabsd.mjs', 'cli.mjs', 'bin/caddy', 'bin/restic', 'bin/hlabs', 'bin/hlabs-priv']) {
  if (!existsSync(join(stage, required))) throw new Error(`The download is missing ${required}`);
}

// The signing key: the release's, or one made for this build.
const signEnv: NodeJS.ProcessEnv = {
  ...env,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
};
const tauri = (args: string[]) =>
  execFileSync('pnpm', ['exec', 'tauri', 'signer', ...args], { cwd: join(root, 'apps/tray'), env: signEnv });
let publicKey: string;
if (env.TAURI_SIGNING_PRIVATE_KEY) {
  const pub = env.HLABS_UPDATE_PUBLIC_KEY;
  if (!pub) throw new Error('Set HLABS_UPDATE_PUBLIC_KEY to the public half of TAURI_SIGNING_PRIVATE_KEY');
  publicKey = pub;
} else {
  say('No TAURI_SIGNING_PRIVATE_KEY: signing with a key made for this build (dist/linux/build.key).');
  tauri(['generate', '--ci', '-p', '', '-w', join(out, 'build.key')]);
  signEnv.TAURI_SIGNING_PRIVATE_KEY = readFileSync(join(out, 'build.key'), 'utf8');
  publicKey = readFileSync(join(out, 'build.key.pub'), 'utf8');
}

writeFileSync(
  join(out, 'install.sh'),
  readFileSync(join(root, 'scripts/install.sh'), 'utf8').replace('@HLABS_PUBLIC_KEY@', spkiBase64(publicKey)),
  { mode: 0o755 },
);
// The installer goes in the tarball too: `hlabs uninstall` runs it (D-144).
copyFileSync(join(out, 'install.sh'), join(stage, 'install.sh'));
chmodSync(join(stage, 'install.sh'), 0o755);

const tarball = `hlabs-${version}-linux-${arch}.tar.gz`;
say(`Packing ${tarball}…`);
run('tar', ['-czf', join(out, tarball), '-C', stage, '.']);
rmSync(stage, { recursive: true, force: true });
const sha256 = createHash('sha256')
  .update(readFileSync(join(out, tarball)))
  .digest('hex');
writeFileSync(join(out, 'SHA256SUMS'), `${sha256}  ${tarball}\n`);

for (const file of ['SHA256SUMS', tarball, 'install.sh']) tauri(['sign', join(out, file)]);
say(`Done: ${out}`);

/** The Ed25519 key of a minisign public key file (base64 of it, as `tauri signer` writes) as base64 SPKI DER. */
function spkiBase64(minisignPublicKeyB64: string): string {
  const line = Buffer.from(minisignPublicKeyB64.trim(), 'base64').toString('utf8').split('\n')[1]?.trim() ?? '';
  const raw = Buffer.from(line, 'base64');
  if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') throw new Error('Not a minisign public key');
  return Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw.subarray(10)]).toString('base64');
}
