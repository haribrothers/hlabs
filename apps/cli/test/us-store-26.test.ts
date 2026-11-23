// US-STORE-26 · Test only the apps a change touches. Which apps store.yml installs (scripts/store-select-lib.ts), and
// what it reports after (the install rate, an issue per failing app). The installs themselves are store-matrix.ts's,
// run by store.yml with real Docker.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  appsTouched,
  dailySample,
  fileIssues,
  forPullRequest,
  issueTitle,
  report,
  shards,
  SMOKE_SET,
  touchesInstallPath,
  type IssueApi,
} from '../../../scripts/store-select-lib';

const ROOT = resolve(import.meta.dirname, '../../..');
const STORE = readdirSync(join(ROOT, 'store/apps'))
  .filter((id) => existsSync(join(ROOT, 'store/apps', id, 'hlabs-app.yml')))
  .sort();
/** A store the size phase 7 grows to (D-148). */
const HUNDRED = [...STORE, ...Array.from({ length: 100 - STORE.length }, (_, i) => `app-${i}`)].sort();
const DAY = '2026-11-22';

describe('US-STORE-26', () => {
  describe('a pull request installs the apps it changes plus the smoke set', () => {
    it('installs a changed app and the smoke set', () => {
      const ids = forPullRequest(
        ['store/apps/gitea/hlabs-app.yml', 'store/apps/gitea/docker-compose.yml', 'store/apps/immich/logo.svg'],
        HUNDRED,
        DAY,
      );
      expect(ids).toEqual(['gitea', 'immich', 'uptime-kuma', 'vaultwarden']);
    });

    it('leaves out an app the pull request removes', () => {
      expect(appsTouched(['store/apps/gone-app/hlabs-app.yml', 'store/apps/mealie/README.md'], HUNDRED)).toEqual([
        'mealie',
      ]);
    });

    it('installs only the smoke set when no app or install code changes', () => {
      expect(forPullRequest(['store/curation.yml', 'store/README.md'], HUNDRED, DAY)).toEqual([...SMOKE_SET]);
    });

    it('adds 10 apps that change daily when the install path changes', () => {
      for (const file of [
        'apps/daemon/src/apps/app-service.ts',
        'apps/daemon/src/caddy/config.ts',
        'apps/daemon/src/engine/compose.ts',
        'packages/app-manifest/src/compose.ts',
        'scripts/store-matrix.ts',
        '.github/workflows/store.yml',
      ]) {
        expect(touchesInstallPath([file]), file).toBe(true);
      }
      expect(touchesInstallPath(['apps/web/src/main.tsx', 'docs/progress.md'])).toBe(false);

      const ids = forPullRequest(['apps/daemon/src/apps/app-service.ts'], HUNDRED, DAY);
      expect(ids).toHaveLength(SMOKE_SET.length + 10);
      for (const id of SMOKE_SET) expect(ids).toContain(id);
      // The same all day, on every runner; another day, another sample.
      expect(forPullRequest(['apps/daemon/src/apps/app-service.ts'], HUNDRED, DAY)).toEqual(ids);
      expect(dailySample(HUNDRED, '2026-11-23')).not.toEqual(dailySample(HUNDRED, DAY));
      // A changed app isn't counted twice.
      const both = forPullRequest(['store/apps/gitea/hlabs-app.yml', 'packages/app-manifest/src/x.ts'], HUNDRED, DAY);
      expect(both).toContain('gitea');
      expect(new Set(both).size).toBe(both.length);
      expect(both.length).toBeGreaterThanOrEqual(SMOKE_SET.length + 10);
    });

    it('spreads the sample over the store', () => {
      const seen = new Set<string>();
      for (let d = 1; d <= 30; d++)
        for (const id of dailySample(HUNDRED, `2026-12-${String(d).padStart(2, '0')}`)) seen.add(id);
      expect(seen.size).toBeGreaterThan(80);
    });
  });

  describe('the nightly run installs every app, split across runners', () => {
    it('gives each runner up to five apps and leaves none out', () => {
      const groups = shards(HUNDRED, 5);
      expect(groups).toHaveLength(20);
      expect(groups.every((g) => g.length === 5)).toBe(true);
      expect(groups.flat()).toEqual(HUNDRED);
      expect(shards(STORE, 5).every((g) => g.length >= 1 && g.length <= 5)).toBe(true);
      expect(shards(STORE, 5)).toHaveLength(Math.ceil(STORE.length / 5));
    });

    it('is what store-select.ts prints for store.yml', () => {
      const run = (...args: string[]) =>
        spawnSync('node', [join(ROOT, 'scripts/store-select.ts'), ...args], { encoding: 'utf8' });
      const nightly = JSON.parse(run('nightly', '--per-runner', '5').stdout) as { planned: string[]; shards: string[] };
      expect(nightly.planned).toEqual(STORE);
      expect(nightly.shards.join(' ').split(' ')).toEqual(STORE);

      const some = JSON.parse(run('apps', 'gitea, immich').stdout) as { shards: string[] };
      expect(some.shards).toEqual(['gitea', 'immich']);
      const unknown = run('apps', 'not-an-app');
      expect(unknown.status).not.toBe(0);
      expect(unknown.stderr).toContain('not in store/apps: not-an-app');
    });

    it('reports the install rate, counting an app with no result as failed', () => {
      const r = report(
        ['gitea', 'immich', 'jellyfin', 'mealie'],
        [
          { id: 'gitea', problem: null, seconds: 80 },
          { id: 'immich', problem: 'install failed: {"step":"health"}', seconds: 600 },
          { id: 'jellyfin', problem: null, seconds: 90 },
        ],
      );
      expect(r.passed).toEqual(['gitea', 'jellyfin']);
      expect(r.failed.map((f) => f.id)).toEqual(['immich', 'mealie']);
      expect(r.failed[1]!.problem).toContain('no result');
      expect(r.rate).toBe(0.5);
      expect(r.markdown).toContain('Install rate: 2 of 4 apps (50.0 %)**, target ≥ 98 % ✗');
      expect(r.markdown).toContain('| immich | install failed: {"step":"health"} |');

      const all = report(
        HUNDRED,
        // One of them fails, whichever ids the store has by then.
        HUNDRED.map((id) => ({ id, problem: id === HUNDRED[3] ? 'boom' : null, seconds: 1 })),
      );
      expect(all.markdown).toContain('99 of 100 apps (99.0 %)**, target ≥ 98 % ✓');
    });

    it('opens an issue naming a failing app, or updates the one already open', () => {
      const calls: string[] = [];
      const api: IssueApi = {
        listOpen: (label) => {
          calls.push(`list ${label}`);
          return [
            { number: 41, title: issueTitle('immich') },
            { number: 7, title: 'Something else' },
          ];
        },
        create: (title, body, label) => calls.push(`create ${label} ${title} :: ${body.split('\n')[0]}`),
        comment: (number, body) => calls.push(`comment #${number} :: ${body.split('\n')[0]}`),
      };
      const done = fileIssues(
        [
          { id: 'immich', problem: 'opened with 500' },
          { id: 'mealie', problem: 'timed out: mealie installed' },
        ],
        api,
        DAY,
        'https://github.com/o/r/actions/runs/1',
      );
      expect(calls).toEqual([
        'list store-matrix',
        "comment #41 :: The nightly store matrix couldn't install, open, restart or uninstall **immich** on 2026-11-22.",
        "create store-matrix Store matrix: mealie doesn't install :: The nightly store matrix couldn't install, open, restart or uninstall **mealie** on 2026-11-22.",
      ]);
      expect(done).toEqual(['#41 immich (updated)', 'mealie (opened)']);
    });
  });

  it('store.yml chooses its apps this way and reports after them', () => {
    const text = readFileSync(join(ROOT, '.github/workflows/store.yml'), 'utf8');
    type Step = { id?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
    type Job = { needs?: string[]; if?: string; steps: Step[]; permissions?: Record<string, string> } & Record<
      string,
      unknown
    >;
    const yml = parse(text) as {
      on: { pull_request: { paths: string[] }; schedule: unknown[]; workflow_dispatch: { inputs: { apps: unknown } } };
      jobs: Record<string, Job>;
    };
    const runs = (job: string) => yml.jobs[job]!.steps.map((s) => s.run ?? '').join('\n');

    expect(Object.keys(yml.jobs)).toEqual(['lint', 'apps', 'matrix', 'report']);
    expect(yml.on.workflow_dispatch.inputs.apps).toBeTruthy();
    expect(yml.on.schedule).toHaveLength(1);
    expect(yml.on.pull_request.paths).toEqual(
      expect.arrayContaining(['store/**', 'scripts/store-select*.ts', 'scripts/store-report.ts']),
    );
    expect(runs('lint')).toContain('pnpm store:lint');

    expect(yml.jobs.apps!.steps[0]!.with).toEqual({ 'fetch-depth': 0 });
    expect(runs('apps')).toContain('node scripts/store-select.ts pr --base "origin/$BASE"');
    expect(runs('apps')).toContain('node scripts/store-select.ts nightly --per-runner 5');

    expect(yml.jobs.matrix!.needs).toEqual(['lint', 'apps']);
    expect(yml.jobs.matrix!.strategy).toEqual({
      'fail-fast': false,
      matrix: { shard: '${{ fromJson(needs.apps.outputs.shards) }}' },
    });
    expect(runs('matrix')).toContain(
      'node scripts/store-matrix.ts --results .matrix-results/${{ strategy.job-index }}.json --prune-images ${{ matrix.shard }}',
    );

    const report = yml.jobs.report!;
    expect(report.needs).toEqual(['apps', 'matrix']);
    expect(report.if).toContain('always()');
    const upload = yml.jobs.matrix!.steps.find((st) =>
      (st as { uses?: string }).uses?.startsWith('actions/upload-artifact'),
    );
    // The results folder is hidden (.matrix-results), which upload-artifact skips unless told.
    expect(upload!.with).toMatchObject({ path: '.matrix-results/', 'include-hidden-files': true });
    expect(report.permissions).toEqual({ contents: 'read', issues: 'write' });
    expect(runs('report')).toContain(
      'node scripts/store-report.ts --planned "$PLANNED" --results .matrix-results $ISSUES',
    );
    expect(report.steps.at(-1)!.env!.ISSUES).toBe("${{ github.event_name == 'schedule' && '--issues' || '' }}");
  });
});
