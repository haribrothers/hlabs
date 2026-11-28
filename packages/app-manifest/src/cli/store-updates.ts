// `pnpm store:updates [--apps a,b] [--write | --pr]`: checks every built-in app for a newer release of its images
// (US-STORE-24, D-154). Without a flag it only reports; --write edits the files here; --pr (store-updates.yml) opens
// or updates one pull request per app on branch store-update/<id>, never merging. Apps under `hold` in
// store/curation.yml are left alone.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { COMPOSE_FILE, listAppDirs, loadCuration, MANIFEST_FILE } from '../node';
import { Registry } from '../registry';
import {
  applyPlan,
  checkApp,
  LABEL,
  MAJOR_LABEL,
  proposeUpdate,
  type AppForUpdate,
  type PullRequestOps,
  type UpdateCheck,
} from '../updates';

const [storeArg, ...rest] = process.argv.slice(2);
const storeDir = resolve(storeArg ?? 'store');
const only = rest.includes('--apps') ? rest[rest.indexOf('--apps') + 1]!.split(',').map((s) => s.trim()) : null;
const mode = rest.includes('--pr') ? 'pr' : rest.includes('--write') ? 'write' : 'report';
const say = (line: string) => void process.stdout.write(`${line}\n`);

const github = {
  'user-agent': 'hlabs-store-updates',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

/** The project's GitHub release page for this tag (with or without a `v`), if it has one. */
async function releaseNotes(source: string | undefined, tag: string): Promise<string | null> {
  const m = source && /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(source);
  if (!m) return null;
  const bare = tag.replace(/^v/, '');
  for (const t of [tag, `v${bare}`, bare]) {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/releases/tags/${t}`, { headers: github });
    if (res.ok) return ((await res.json()) as { html_url: string }).html_url;
  }
  return `${source.replace(/\/$/, '')}/releases`;
}

const hold = new Set(loadCuration(storeDir).hold);
const registry = new Registry((url, init) => fetch(url, init));
const apps: Array<{ dir: string; app: AppForUpdate }> = listAppDirs(storeDir).flatMap((dir) => {
  const m = parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as Record<string, unknown>;
  const c = parse(readFileSync(join(dir, COMPOSE_FILE), 'utf8')) as { services: Record<string, { image?: string }> };
  const id = String(m.id);
  if (only && !only.includes(id)) return [];
  return [
    {
      dir,
      app: {
        id,
        name: String(m.name),
        version: String(m.version),
        platforms: (m.platforms as string[]) ?? [],
        ...(typeof m.source === 'string' ? { source: m.source } : {}),
        images: Object.entries(c.services).flatMap(([service, s]) => (s.image ? [{ service, image: s.image }] : [])),
      },
    },
  ];
});

/** git and gh, for --pr in store-updates.yml. */
function pullRequestOps(): PullRequestOps {
  const repo = execFileSync('git', ['-C', storeDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  const gh = (...args: string[]) => execFileSync('gh', args, { cwd: repo, encoding: 'utf8' });
  git('fetch', '--quiet', 'origin', 'main');
  for (const [label, color, text] of [
    [LABEL, '0E8A16', 'A built-in app has a newer version (US-STORE-24)'],
    [MAJOR_LABEL, 'D93F0B', 'The new version looks like a major one: read its release notes'],
  ] as const) {
    gh('label', 'create', label, '--color', color, '--description', text, '--force');
  }
  return {
    openPullRequest: (branch) =>
      (
        JSON.parse(gh('pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,title')) as Array<{
          number: number;
          title: string;
        }>
      )[0] ?? null,
    pushBranch: (branch, files, message) => {
      git('switch', '--quiet', '-C', branch, 'origin/main');
      for (const [path, text] of Object.entries(files)) writeFileSync(join(repo, path), text);
      git('add', ...Object.keys(files));
      git('commit', '--quiet', '--no-verify', '-m', message);
      git('push', '--quiet', '--force', 'origin', branch);
      git('switch', '--quiet', '--detach', 'origin/main');
      // Pull requests opened with Actions' own token don't start other workflows: run the matrix for it here.
      if (process.env.STORE_UPDATES_DISPATCH === '1') {
        gh('workflow', 'run', 'store.yml', '--ref', branch, '-f', `apps=${branch.split('/').at(-1)}`);
      }
    },
    create: (branch, title, body, labels) => {
      const url = gh(
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        branch,
        '--title',
        title,
        '--body',
        body,
        ...labels.flatMap((l) => ['--label', l]),
      ).trim();
      return Number(url.split('/').at(-1));
    },
    edit: (number, title, body, labels) =>
      void gh(
        'pr',
        'edit',
        String(number),
        '--title',
        title,
        '--body',
        body,
        ...labels.flatMap((l) => ['--add-label', l]),
      ),
  };
}

const ops = mode === 'pr' ? pullRequestOps() : null;
const lines: string[] = [];
for (const { dir, app } of apps) {
  let check: UpdateCheck;
  if (hold.has(app.id)) check = { kind: 'skipped', id: app.id, reason: 'held in curation.yml' };
  else
    check = await checkApp(app, {
      // From the start (Docker Hub: alphabetical) and after today's tag (GHCR: newest last), together.
      tags: async (image, current) => [
        ...new Set([...(await registry.tags(image)), ...(await registry.tags(image, { after: current }))]),
      ],
      manifest: (image) => registry.manifest(image),
      created: (image) => registry.created(image),
    });

  if (check.kind === 'current') lines.push(`- ${app.id} ${app.version}: up to date`);
  else if (check.kind === 'skipped') lines.push(`- ${app.id} ${app.version}: skipped (${check.reason})`);
  else {
    const plan = check.plan;
    const edited = applyPlan(
      readFileSync(join(dir, MANIFEST_FILE), 'utf8'),
      readFileSync(join(dir, COMPOSE_FILE), 'utf8'),
      plan,
    );
    let done = '';
    if (mode === 'write') {
      writeFileSync(join(dir, MANIFEST_FILE), edited.manifest);
      writeFileSync(join(dir, COMPOSE_FILE), edited.compose);
      done = ' (files edited)';
    } else if (ops) {
      const root = execFileSync('git', ['-C', storeDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
      const at = (file: string) => relative(root, join(dir, file));
      const notes = await releaseNotes(app.source, plan.tag);
      const r = proposeUpdate(
        plan,
        { [at(MANIFEST_FILE)]: edited.manifest, [at(COMPOSE_FILE)]: edited.compose },
        notes,
        ops,
      );
      done = ` (pull request #${r.number} ${r.action})`;
    }
    lines.push(`- **${app.id} ${plan.fromVersion} → ${plan.toVersion}**${plan.major ? ' ⚠️ major' : ''}${done}`);
  }
}

const summary = ['## Built-in app updates', '', ...lines, ''].join('\n');
say(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
