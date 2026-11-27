// Which built-in apps the store matrix installs (US-STORE-26, D-148), and what it reports, without the network:
// a pull request installs the apps it changes plus the smoke set; a change to the install path adds a sample of
// 10 apps that changes every day; the nightly run installs every app, a few to each runner.

/** Installed on every pull request the matrix runs for (D-071). */
export const SMOKE_SET = ['uptime-kuma', 'vaultwarden'] as const;

/** How many apps a pull request that changes the install path adds to the smoke set. */
export const DAILY_SAMPLE = 10;

/** Files whose change can break installing any app: the matrix then runs the smoke set and the daily sample. */
const INSTALL_PATH = [
  /^packages\/app-manifest\//,
  /^apps\/daemon\/src\/(apps|caddy|engine)\//,
  /^scripts\/store-(matrix|select|report)/,
  /^\.github\/workflows\/store\.yml$/,
];

/** The app ids a change touches: `store/apps/<id>/…`, for apps that still exist. */
export function appsTouched(changed: string[], all: string[]): string[] {
  const ids = new Set<string>();
  for (const file of changed) {
    const m = /^store\/apps\/([^/]+)\//.exec(file);
    if (m && all.includes(m[1]!)) ids.add(m[1]!);
  }
  return [...ids].sort();
}

export function touchesInstallPath(changed: string[]): boolean {
  return changed.some((file) => INSTALL_PATH.some((re) => re.test(file)));
}

/** FNV-1a: a small, stable hash, so the sample is the same all day on every runner. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** `n` apps that change daily: the same for every run on one UTC day, never one of `except`. */
export function dailySample(all: string[], day: string, n = DAILY_SAMPLE, except: readonly string[] = []): string[] {
  return all
    .filter((id) => !except.includes(id))
    .map((id) => ({ id, key: hash(`${day}/${id}`) }))
    .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
    .slice(0, n)
    .map((x) => x.id)
    .sort();
}

/** The apps a pull request installs. */
export function forPullRequest(changed: string[], all: string[], day: string): string[] {
  const smoke = SMOKE_SET.filter((id) => all.includes(id));
  const ids = new Set<string>([...smoke, ...appsTouched(changed, all)]);
  if (touchesInstallPath(changed)) for (const id of dailySample(all, day, DAILY_SAMPLE, [...ids])) ids.add(id);
  return [...ids].sort();
}

/** Splits apps across runners, `perRunner` to each, keeping the store's order. */
export function shards(ids: string[], perRunner: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += perRunner) out.push(ids.slice(i, i + perRunner));
  return out;
}

/** One app's run, as `store-matrix.ts --results` writes it. */
export interface MatrixResult {
  id: string;
  /** What went wrong, or null when it installed, opened, restarted and uninstalled. */
  problem: string | null;
  seconds: number;
}

export interface MatrixReport {
  planned: number;
  passed: string[];
  failed: Array<{ id: string; problem: string }>;
  /** Passed ÷ planned, 0–1; the store's target is 0.98 (00 · Success metrics). */
  rate: number;
  markdown: string;
}

export const TARGET_RATE = 0.98;

/** Every planned app's result; one with no result (its runner failed before writing it) counts as failed. */
export function report(planned: string[], results: MatrixResult[]): MatrixReport {
  const byId = new Map(results.map((r) => [r.id, r]));
  const passed: string[] = [];
  const failed: Array<{ id: string; problem: string }> = [];
  for (const id of planned) {
    const r = byId.get(id);
    if (!r) failed.push({ id, problem: 'no result: its runner stopped before reporting' });
    else if (r.problem) failed.push({ id, problem: r.problem });
    else passed.push(id);
  }
  const rate = planned.length ? passed.length / planned.length : 1;
  const pct = (rate * 100).toFixed(1);
  const lines = [
    '## Store matrix',
    '',
    `**Install rate: ${passed.length} of ${planned.length} apps (${pct} %)**, target ≥ ${TARGET_RATE * 100} %${rate >= TARGET_RATE ? ' ✓' : ' ✗'}`,
    '',
  ];
  if (failed.length) {
    lines.push('| App | What went wrong |', '| --- | --- |');
    for (const f of failed)
      lines.push(`| ${f.id} | ${f.problem.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300)} |`);
    lines.push('');
  }
  return { planned: planned.length, passed, failed, rate, markdown: lines.join('\n') };
}

export const ISSUE_LABEL = 'store-matrix';

export function issueTitle(id: string): string {
  return `Store matrix: ${id} doesn't install`;
}

export function issueBody(id: string, problem: string, day: string, runUrl: string): string {
  return [
    `The nightly store matrix couldn't install, open, restart or uninstall **${id}** on ${day}.`,
    '',
    '```',
    problem.slice(0, 2000),
    '```',
    '',
    `Run: ${runUrl}`,
    '',
    `Check it locally with \`node scripts/store-matrix.ts ${id}\`. If it can't be fixed soon, hold it in \`store/curation.yml\` (US-STORE-23).`,
  ].join('\n');
}

/** What the report does to GitHub issues, through the `gh` CLI. */
export interface IssueApi {
  /** Open issues with the label: number and title. */
  listOpen(label: string): Array<{ number: number; title: string }>;
  create(title: string, body: string, label: string): void;
  comment(number: number, body: string): void;
}

/** Opens an issue for each failing app, or adds a comment to the one already open for it. */
export function fileIssues(failed: MatrixReport['failed'], api: IssueApi, day: string, runUrl: string): string[] {
  const open = api.listOpen(ISSUE_LABEL);
  const done: string[] = [];
  for (const { id, problem } of failed) {
    const title = issueTitle(id);
    const body = issueBody(id, problem, day, runUrl);
    const existing = open.find((i) => i.title === title);
    if (existing) {
      api.comment(existing.number, body);
      done.push(`#${existing.number} ${id} (updated)`);
    } else {
      api.create(title, body, ISSUE_LABEL);
      done.push(`${id} (opened)`);
    }
  }
  return done;
}
