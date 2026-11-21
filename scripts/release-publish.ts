// release.yml's last step before uploading (D-146): in a folder with every build's files, sign each one with the hlabs
// update key (when there is one), add install.sh with that key written in, write one signed SHA256SUMS, the update
// manifest latest.json, and the release's text (release-body.md, beside the folder, not uploaded).
//
//   node scripts/release-publish.ts --dir release --version 1.2.3 --notes apps/site/src/content/releases/1.2.3.md
//     [--repo haribrothers/hlabs] [--mac-signed]
//
// Signing needs TAURI_SIGNING_PRIVATE_KEY (and _PASSWORD) and HLABS_UPDATE_PUBLIC_KEY; without them nothing is signed,
// and neither install.sh nor latest.json is written (an unsigned release updates and installs nothing, D-139).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checksums, manifest, releaseText } from './release-lib.ts';
import { installScript, signer } from './update-key.ts';

const root = resolve(import.meta.dirname, '..');
const say = (line: string) => void process.stdout.write(`${line}\n`);
const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    version: { type: 'string' },
    notes: { type: 'string' },
    repo: { type: 'string', default: 'haribrothers/hlabs' },
    'mac-signed': { type: 'boolean', default: false },
  },
});
const dir = resolve(values.dir ?? 'release');
const version = values.version;
if (!version) throw new Error('--version is required');
const notes =
  values.notes && existsSync(values.notes)
    ? readFileSync(values.notes, 'utf8')
        .replace(/^---[\s\S]*?---\n/, '')
        .trim()
    : `- hlabs ${version}`;

const key = process.env.TAURI_SIGNING_PRIVATE_KEY || '';
const publicKey = process.env.HLABS_UPDATE_PUBLIC_KEY || '';
const signed = key !== '' && publicKey !== '';
if (key && !publicKey) throw new Error('TAURI_SIGNING_PRIVATE_KEY is set but HLABS_UPDATE_PUBLIC_KEY isn’t');

// What the builds left besides their own files: signatures made with other keys, their own checksums.
for (const f of readdirSync(dir)) {
  if (f.endsWith('.sig') || f === 'SHA256SUMS' || f === 'latest.json') rmSync(join(dir, f));
}
if (signed) {
  writeFileSync(
    join(dir, 'install.sh'),
    installScript(readFileSync(join(root, 'scripts/install.sh'), 'utf8'), publicKey),
    {
      mode: 0o755,
    },
  );
}

const files = readdirSync(dir)
  .filter((f) => !f.startsWith('.'))
  .sort();
const sign = signer({
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
});
const sha256 = (f: string) =>
  createHash('sha256')
    .update(readFileSync(join(dir, f)))
    .digest('hex');
const entries = files.map((file) => {
  if (signed) sign(['sign', join(dir, file)]);
  return { file, sha256: sha256(file), signature: signed ? readFileSync(join(dir, `${file}.sig`), 'utf8').trim() : '' };
});
writeFileSync(join(dir, 'SHA256SUMS'), checksums(entries));
if (signed) {
  sign(['sign', join(dir, 'SHA256SUMS')]);
  const latest = manifest({
    version,
    notes,
    base: `https://github.com/${values.repo}/releases/download/v${version}`,
    files: entries,
    pubDate: new Date().toISOString(),
  });
  writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
  say(`latest.json: ${Object.keys(latest.platforms).join(', ')}`);
}
writeFileSync(
  join(dir, '..', 'release-body.md'),
  releaseText({ version, notes, signed, macSigned: values['mac-signed'] }),
);
say(`${files.length} files${signed ? ', signed' : ', not signed'}, in ${dir}`);
