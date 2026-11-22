// Which apps the store matrix installs, for store.yml (US-STORE-26):
//
//   node scripts/store-select.ts pr --base origin/main     the apps a pull request changes, plus the smoke set
//                                                           (and 10 daily apps when it changes the install path)
//   node scripts/store-select.ts nightly [--per-runner 5]  every app, a few to each runner
//   node scripts/store-select.ts apps uptime-kuma,gitea    just these, one to each runner
//
// Prints {"planned": [...ids], "shards": ["id id", ...]}; on GitHub Actions also writes them as step outputs.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { forPullRequest, shards } from './store-select-lib.ts';

const REPO = resolve(import.meta.dirname, '..');
const APPS = join(REPO, 'store', 'apps');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const all = readdirSync(APPS)
  .filter((id) => existsSync(join(APPS, id, 'hlabs-app.yml')))
  .sort();
const mode = process.argv[2];
let groups: string[][];

if (mode === 'pr') {
  const base = flag('--base') ?? 'origin/main';
  const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  groups = shards(forPullRequest(changed, all, new Date().toISOString().slice(0, 10)), 1);
} else if (mode === 'nightly') {
  groups = shards(all, Number(flag('--per-runner') ?? 5));
} else if (mode === 'apps') {
  const wanted = (process.argv[3] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = wanted.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(`not in store/apps: ${unknown.join(', ')}`);
  groups = shards(wanted.length ? wanted : all, wanted.length ? 1 : 5);
} else {
  throw new Error('usage: store-select.ts pr --base <ref> | nightly [--per-runner n] | apps <id,id>');
}

const out = { planned: groups.flat(), shards: groups.map((g) => g.join(' ')) };
process.stdout.write(`${JSON.stringify(out)}\n`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `planned=${JSON.stringify(out.planned)}\nshards=${JSON.stringify(out.shards)}\n`,
  );
}
