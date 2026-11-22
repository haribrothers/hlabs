// `hlabs library` (US-STORE-27, 28; D-149, D-160): start an app library, add an app to fill in, check it with the
// store's own validator, write index.json, and sign it. The signing key lives in hlabs's keychain: `keygen` and `sign`
// ask the daemon (with the tray token), so this command never holds the private key.
import {
  addLibraryApp,
  checkLibrary,
  indexLibrary,
  initLibrary,
  INDEX_FILE,
  LibraryError,
  PUBLIC_KEY_FILE,
  problemLine,
  SIGNATURE_FILE,
} from '@hlabs/app-manifest/library';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { CliError, DaemonError, type DaemonClient } from './daemon';
import type { Io } from './io';

export const LIBRARY_HELP = `Usage: hlabs library <command> [folder]

  init <folder>       Start a library: a README, apps/ with an example app, and a GitHub workflow
  add <id> [folder]   Add an app to fill in, in apps/<id>/
  check [folder]      Check every app with the App Store's rules
  index [folder]      Write index.json for the apps that pass
  keygen [--replace]  Make a key to sign libraries with (kept in hlabs's keychain)
  sign [folder]       Sign index.json with that key

The folder is the current one unless you give it.`;

const expand = (dir: string) => resolve(dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir);

/** "my-apps" → "My apps". */
const nameOf = (dir: string) => {
  const words = basename(dir).replace(/[-_]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'My apps';
};

/** The library's id: its folder's name, as a source id. */
const idOf = (dir: string) =>
  basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'library';

export async function library(
  io: Io,
  args: string[],
  opts: { client: () => DaemonClient; replace: boolean },
): Promise<number> {
  const [sub, arg] = args;
  try {
    switch (sub) {
      case 'init': {
        if (!arg) throw new CliError('Which folder? For example: hlabs library init ~/hlabs/users/<you>/my-apps');
        const dir = expand(arg);
        const files = initLibrary(dir, nameOf(dir));
        io.out(`Started ${nameOf(dir)} in ${dir}:`);
        for (const f of files) io.out(`  ${f}`);
        io.out('');
        io.out('Next: add your apps with hlabs library add <id>, then hlabs library check.');
        io.out(`In hlabs: App Store › App sources › Add a source › Folder on this computer, then ${dir}`);
        io.out("(it has to be inside hlabs's storage, such as your Home folder there).");
        return 0;
      }
      case 'add': {
        if (!arg) throw new CliError('Which app? For example: hlabs library add wiki');
        const at = addLibraryApp(expand(args[2] ?? '.'), arg);
        io.out(
          `Added ${at}/. Fill in the TODOs in hlabs-app.yml and docker-compose.yml, then run hlabs library check.`,
        );
        return 0;
      }
      case 'check': {
        const dir = expand(arg ?? '.');
        const { apps, problems } = checkLibrary(dir);
        if (!apps.length) throw new CliError(`${dir} has no apps: is it a library? (hlabs library init starts one)`);
        for (const p of problems) io.err(problemLine(p));
        const broken = new Set(problems.map((p) => p.appId)).size;
        if (broken) {
          io.err(`${broken} of ${apps.length} ${apps.length === 1 ? 'app has' : 'apps have'} problems.`);
          return 1;
        }
        io.out(`✓ ${apps.length} ${apps.length === 1 ? 'app' : 'apps'} pass the App Store's checks.`);
        return 0;
      }
      case 'index': {
        const dir = expand(arg ?? '.');
        const { index, leftOut } = indexLibrary(dir, { id: idOf(dir), name: nameOf(dir) });
        io.out(`Wrote ${INDEX_FILE} with ${index.apps.length} ${index.apps.length === 1 ? 'app' : 'apps'}.`);
        if (leftOut.length) io.err(`Left out until they pass hlabs library check: ${leftOut.join(', ')}.`);
        if (existsSync(join(dir, SIGNATURE_FILE))) io.out('Sign it again: hlabs library sign');
        return 0;
      }
      case 'keygen': {
        const key = await opts.client().mutate<{ fingerprint: string; existed: boolean }>('tray.libraryKeygen', {
          replace: opts.replace,
        });
        if (key.existed) {
          io.out(`You already have a signing key: ${key.fingerprint}`);
          io.out(
            'To make a new one (libraries signed with the old one have to be added again): hlabs library keygen --replace',
          );
        } else {
          io.out(`Made a signing key: ${key.fingerprint}`);
          io.out("It's kept in hlabs's keychain on this computer. Sign a library with hlabs library sign.");
        }
        return 0;
      }
      case 'sign': {
        const dir = expand(arg ?? '.');
        const file = join(dir, INDEX_FILE);
        if (!existsSync(file)) throw new CliError(`There's no ${INDEX_FILE} in ${dir}: run hlabs library index first`);
        let signed: { signature: string; publicKey: string; fingerprint: string };
        try {
          signed = await opts.client().mutate('tray.librarySign', { data: readFileSync(file).toString('base64') });
        } catch (err) {
          if (err instanceof DaemonError && err.hlabsCode === 'LIBRARY_KEY_MISSING') {
            throw new CliError('There is no signing key on this computer: make one with hlabs library keygen');
          }
          throw err;
        }
        writeFileSync(join(dir, SIGNATURE_FILE), signed.signature);
        writeFileSync(join(dir, PUBLIC_KEY_FILE), signed.publicKey);
        io.out(`Signed ${INDEX_FILE} with ${signed.fingerprint} (${SIGNATURE_FILE}, ${PUBLIC_KEY_FILE}).`);
        io.out('People who add this library see that fingerprint in "Trust this source?".');
        return 0;
      }
      default:
        io.out(LIBRARY_HELP);
        return sub ? 2 : 0;
    }
  } catch (err) {
    if (err instanceof LibraryError) throw new CliError(err.message);
    throw err;
  }
}
