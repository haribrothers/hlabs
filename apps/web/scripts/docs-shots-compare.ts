// The docs-shots bot's comparison (US-SITE-11, D-177), after a run of the docs-shots project: each screenshot that
// differs from the committed one in git is kept only when more than 1% of its pixels changed (or it's new); the rest go
// back to the committed file, so a pull request never carries noise. Prints what changed as Markdown (the pull request's
// body), and in GitHub Actions writes `changed=true|false` to $GITHUB_OUTPUT and the table to the job summary.
//   pnpm --filter @hlabs/web docs-shots:compare [--report <file>]
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CHANGE_THRESHOLD, classifyShot, type ShotChange } from '../e2e/support/pixel-diff.ts';

const SHOTS = resolve(import.meta.dirname, '../../site/src/assets/shots');
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const shotsPath = relative(root, SHOTS);

// Modified and new screenshots, as git sees them.
const listed = git('ls-files', '--modified', '--others', '--exclude-standard', '--', `${shotsPath}/*.webp`)
  .toString()
  .split('\n')
  .filter(Boolean);
const files = [...new Set(listed)].sort();

const rows: Array<{ file: string; change: ShotChange }> = [];
for (const file of files) {
  const after = readFileSync(resolve(root, file));
  let before: Buffer | null;
  try {
    before = execFileSync('git', ['show', `HEAD:${file}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Not in git yet: a new screenshot.
    before = null;
  }
  const change = await classifyShot(before, after);
  // Noise: the committed image stays.
  if (change.kind === 'unchanged') git('checkout', '--', file);
  rows.push({ file, change });
}

const kept = rows.filter((r) => r.change.kind !== 'unchanged');
const pct = (ratio: number) => `${(ratio * 100).toFixed(2)}%`;
const name = (file: string) =>
  file
    .split('/')
    .at(-1)!
    .replace(/\.webp$/, '');
const lines = [
  kept.length
    ? `The docs screenshots changed: ${kept.length} of them differ by more than ${pct(CHANGE_THRESHOLD)} of their pixels.`
    : `The docs screenshots are current (no image changed by more than ${pct(CHANGE_THRESHOLD)} of its pixels).`,
  '',
  ...(rows.length
    ? [
        '| Screenshot | Pixels changed | In this pull request |',
        '| --- | --- | --- |',
        ...rows.map(({ file, change }) =>
          change.kind === 'new'
            ? `| \`${name(file)}\` | new | yes |`
            : `| \`${name(file)}\` | ${pct(change.ratio)} | ${change.kind === 'changed' ? 'yes' : 'no'} |`,
        ),
      ]
    : []),
];
const report = `${lines.join('\n')}\n`;
process.stdout.write(report);

const at = process.argv.indexOf('--report');
if (at > 0 && process.argv[at + 1]) writeFileSync(process.argv[at + 1]!, report);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${kept.length > 0}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
