// After the store matrix (US-STORE-26): the install rate and what failed in the run's summary, and with --issues
// (the nightly run) an issue for each failing app, or a comment on the one already open for it. Exits 1 when any
// planned app didn't pass.
//
//   node scripts/store-report.ts --planned '["immich",…]' --results <results JSON, or a folder of them> [--issues]
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileIssues, report, type IssueApi, type MatrixResult } from './store-select-lib.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const planned = JSON.parse(flag('--planned') ?? '[]') as string[];
const dir = flag('--results') ?? '.matrix-results';
/** Every results file under `dir` (or `dir` itself, when it's one file). */
const files = !existsSync(dir)
  ? []
  : statSync(dir).isFile()
    ? [dir]
    : readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(dir, f));
const results = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as MatrixResult[]);

const r = report(planned, results);
process.stdout.write(`${r.markdown}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${r.markdown}\n`);

if (process.argv.includes('--issues') && r.failed.length) {
  const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8' });
  const api: IssueApi = {
    listOpen: (label) =>
      JSON.parse(
        gh(['issue', 'list', '--label', label, '--state', 'open', '--limit', '200', '--json', 'number,title']),
      ),
    create: (title, body, label) => {
      gh([
        'label',
        'create',
        label,
        '--color',
        'D93F0B',
        '--description',
        'An app the nightly store matrix fails on',
        '--force',
      ]);
      gh(['issue', 'create', '--title', title, '--body', body, '--label', label]);
    },
    comment: (number, body) => void gh(['issue', 'comment', String(number), '--body', body]),
  };
  const run = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  for (const line of fileIssues(r.failed, api, new Date().toISOString().slice(0, 10), run)) {
    process.stdout.write(`issue: ${line}\n`);
  }
}

// Red when any app didn't pass, including one whose result never arrived.
if (r.failed.length) process.exitCode = 1;
