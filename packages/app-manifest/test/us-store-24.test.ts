// US-STORE-24 · Keep the built-in apps up to date. Which release the update bot proposes (src/updates.ts), the edits it
// makes, the one pull request per app it opens or updates, and store-updates.yml. Registry and GitHub are fakes here;
// `pnpm store:updates` runs them for real.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { curationIssues } from '../src/node';
import { Registry } from '../src/registry';
import { StoreCuration } from '../src/store-index';
import {
  applyPlan,
  checkApp,
  isMajor,
  newestTag,
  prBody,
  proposeUpdate,
  releasesOf,
  type AppForUpdate,
  type Release,
  type PullRequestOps,
  type UpdatePlan,
} from '../src/updates';

const ROOT = resolve(import.meta.dirname, '../../..');
const D = (n: number) => `sha256:${String(n).repeat(64).slice(0, 64)}`;
const BOTH = ['linux/amd64', 'linux/arm64'];

const immich: AppForUpdate = {
  id: 'immich',
  name: 'Immich',
  version: '3.2.2',
  platforms: BOTH,
  source: 'https://github.com/immich-app/immich',
  images: [
    { service: 'immich-server', image: `ghcr.io/immich-app/immich-server:v3.2.2@${D(1)}` },
    { service: 'immich-machine-learning', image: `ghcr.io/immich-app/immich-machine-learning:v3.2.2@${D(2)}` },
    { service: 'redis', image: `docker.io/valkey/valkey:9@${D(3)}` },
    { service: 'database', image: `ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0@${D(4)}` },
  ],
};

/**
 * A registry with these tags for every image, and these platforms for every new tag. Today's pinned image was built
 * on 1 Nov 2026 and every tag on 20 Nov, unless `built` gives a tag's date (null: the image doesn't say).
 */
function lookups(
  tags: string[],
  platforms = [...BOTH, 'linux/arm/v7'],
  missing: string[] = [],
  built: Record<string, string | null> = {},
  releases: Release[] | null | Error = null,
) {
  const asked: string[] = [];
  return {
    asked,
    look: {
      tags: async (image: string) => {
        asked.push(`tags ${image}`);
        return tags;
      },
      manifest: async (image: string) => {
        asked.push(`manifest ${image}`);
        if (missing.includes(image)) throw new Error("doesn't exist");
        return { digest: D(image.length % 10), platforms };
      },
      created: async (image: string) => {
        asked.push(`created ${image}`);
        const key = image.includes('@') ? '@' : image.split(':').at(-1)!;
        const at = key in built ? built[key] : key === '@' ? '2026-11-01' : '2026-11-20';
        return at ? new Date(at) : null;
      },
      releases: async (version: string) => {
        asked.push(`releases ${version}`);
        if (releases instanceof Error) throw releases;
        return releases;
      },
    },
  };
}

describe('US-STORE-24', () => {
  describe('finds a newer release tag than the manifest’s version', () => {
    it('takes the newest of the same pattern, numerically', () => {
      expect(newestTag('2.5.5', ['2.5.4', '2.5.5', '2.5.9', '2.5.12', '2', '2.5', 'latest'])).toBe('2.5.12');
      expect(newestTag('v3.2.2', ['v3.2.1', 'v3.10.0', 'v3.9.4', 'commit-abc', 'pr-123'])).toBe('v3.10.0');
      expect(newestTag('35.0.1-apache', ['35.0.3-apache', '35.0.4-fpm', '36.0.0', '35.0.2-apache'])).toBe(
        '35.0.3-apache',
      );
      expect(newestTag('2.5.5', ['2.5.4', '2.5.5'])).toBeNull();
    });

    it('skips pre-releases and tags that don’t look like its releases', () => {
      expect(
        newestTag('v3.2.2', [
          'v3.3.0-rc.1',
          'v3.3.0-beta',
          'v3.3.0rc1',
          'v3.3.0-alpine',
          '3.3.0',
          'v3.3',
          'v3.2.3-dev',
        ]),
      ).toBeNull();
      expect(newestTag('2026.9.4', ['2026.10.0b3', '2026.10.0.dev20261001', '2026.10.1', 'stable'])).toBe('2026.10.1');
    });

    it('skips tags of another numbering scheme (a number gaining more than one digit)', () => {
      // From the bot's first run (28 Nov 2026): linuxserver's build dates, BookStack's and PhotoPrism's.
      expect(newestTag('4.1.4', ['2021.11.18', '4.1.5', '4.1.4'])).toBe('4.1.5');
      expect(newestTag('26.3.20261120', ['2021.11.25'])).toBeNull();
      expect(newestTag('26.09.3', ['26.09.20260929', '26.09.4'])).toBe('26.09.4');
      expect(newestTag('261029', ['20220121', '261120'])).toBe('261120');
      // One more digit is still an ordinary release.
      expect(newestTag('9.4.0', ['10.0.0'])).toBe('10.0.0');
      expect(newestTag('v3.9.4', ['v3.10.0'])).toBe('v3.10.0');
    });

    it('only takes a tag built after the image pinned today', async () => {
      // qBittorrent 5.3.0 beside linuxserver's 2020 Ubuntu-base `20.04.x` tags.
      const qbit: AppForUpdate = {
        id: 'qbittorrent',
        name: 'qBittorrent',
        version: '5.3.0',
        platforms: BOTH,
        images: [{ service: 'app', image: `lscr.io/linuxserver/qbittorrent:5.3.0@${D(1)}` }],
      };
      const old = { '20.04.1': '2020-05-01', '20.04.0': '2020-04-20', '18.04.1': '2019-01-01' };
      const { look, asked } = lookups(['18.04.1', '20.04.0', '20.04.1', '5.3.0', '5.3.1'], BOTH, [], old);
      const check = await checkApp(qbit, look);
      expect((check as { plan: UpdatePlan }).plan.toVersion).toBe('5.3.1');
      // One date per old series: 20.04.0 isn't looked at once 20.04.1 was built earlier.
      expect(asked.filter((a) => a.startsWith('created'))).toEqual([
        `created lscr.io/linuxserver/qbittorrent@${D(1)}`,
        'created lscr.io/linuxserver/qbittorrent:20.04.1',
        'created lscr.io/linuxserver/qbittorrent:18.04.1',
        'created lscr.io/linuxserver/qbittorrent:5.3.1',
      ]);

      // Every higher-numbered tag is older (Gitea's stray 28.4.0): up to date, no pull request.
      expect(await checkApp(qbit, lookups(['5.3.0', '28.4.0'], BOTH, [], { '28.4.0': '2024-01-01' }).look)).toEqual({
        kind: 'current',
        id: 'qbittorrent',
      });
      // A tag that doesn't say when it was built isn't trusted either.
      expect(await checkApp(qbit, lookups(['5.3.1'], BOTH, [], { '5.3.1': null }).look)).toEqual({
        kind: 'current',
        id: 'qbittorrent',
      });
      // Nor is anything, when today's image doesn't say.
      expect(await checkApp(qbit, lookups(['5.3.1'], BOTH, [], { '@': null }).look)).toEqual({
        kind: 'skipped',
        id: 'qbittorrent',
        reason: 'lscr.io/linuxserver/qbittorrent:5.3.0 has no build date',
      });
      // Too many old series to read: left to a person, and the summary says so.
      const many = Array.from({ length: 12 }, (_, i) => `${20 + i}.0.0`);
      const stale = Object.fromEntries(many.map((t) => [t, '2020-01-01']));
      expect(await checkApp(qbit, lookups(many, BOTH, [], stale).look)).toMatchObject({
        kind: 'skipped',
        reason: expect.stringContaining('were built before 5.3.0: check by hand'),
      });
    });

    it('skips a version whose GitHub releases are all pre-releases (n8n tags them like releases)', async () => {
      const rel = (tag: string, prerelease = false): Release => ({
        tag,
        prerelease,
        url: `https://github.com/o/r/releases/tag/${encodeURIComponent(tag)}`,
      });
      // Tag styles: `v…`, bare, `name@…`; builds (Radarr's fourth number) only when there's no exact one.
      const list = [
        rel('n8n@3.4.1', true),
        rel('v7.0.3.10918'),
        rel('v7.0.3.10912', true),
        rel('12.4'),
        rel('v12.4.1'),
      ];
      expect(releasesOf('3.4.1', list).map((r) => r.tag)).toEqual(['n8n@3.4.1']);
      expect(releasesOf('7.0.3', list).map((r) => r.tag)).toEqual(['v7.0.3.10918', 'v7.0.3.10912']);
      expect(releasesOf('12.4', list).map((r) => r.tag)).toEqual(['12.4']);
      expect(releasesOf('12.5', list)).toEqual([]);

      const n8n: AppForUpdate = {
        id: 'n8n',
        name: 'n8n',
        version: '2.41.3',
        platforms: BOTH,
        source: 'https://github.com/n8n-io/n8n',
        images: [{ service: 'app', image: `docker.io/n8nio/n8n:2.41.3@${D(1)}` }],
      };
      const releases = [rel('n8n@3.4.1', true), rel('n8n@2.50.3', true), rel('n8n@2.49.8'), rel('n8n@2.41.3')];
      const { look, asked } = lookups(['2.41.3', '2.49.8', '2.50.3', '3.2.1', '3.4.1'], BOTH, [], {}, releases);
      const plan = ((await checkApp(n8n, look)) as { plan: UpdatePlan }).plan;
      expect(plan).toMatchObject({ toVersion: '2.49.8', releaseUrl: rel('n8n@2.49.8').url });
      // Pre-releases are left out before any build date is read; the releases are asked for once.
      expect(asked.filter((a) => /^(created|releases)/.test(a))).toEqual([
        `created docker.io/n8nio/n8n@${D(1)}`,
        'releases 2.41.3',
        'created docker.io/n8nio/n8n:2.49.8',
      ]);
      // Radarr: one of 7.0.3's builds is a release, so 7.0.3 is.
      const radarr = {
        ...n8n,
        id: 'radarr',
        version: '6.4.4',
        images: [{ service: 'app', image: `x/radarr:6.4.4@${D(2)}` }],
      };
      const builds = [rel('v7.0.3.10918'), rel('v7.0.3.10912', true)];
      expect(await checkApp(radarr, lookups(['7.0.3'], BOTH, [], {}, builds).look)).toMatchObject({
        plan: { toVersion: '7.0.3', releaseUrl: rel('v7.0.3.10918').url },
      });
      // A project that releases on GitHub (today's 6.4.4 is there) didn't release a tag it has no release for
      // (n8n's 3.2.1 above).
      expect(await checkApp(radarr, lookups(['7.0.3'], BOTH, [], {}, [rel('v6.4.4.10685')]).look)).toEqual({
        kind: 'current',
        id: 'radarr',
      });
      // Not on GitHub (or not this version): the tag decides, with no release link.
      expect(await checkApp(radarr, lookups(['7.0.3']).look)).toMatchObject({ plan: { releaseUrl: null } });
      // GitHub didn't answer: skipped, rather than risk a pre-release.
      const limited = lookups(['7.0.3'], BOTH, [], {}, new Error("GitHub answered 403 for o/r's releases"));
      expect(await checkApp(radarr, limited.look)).toEqual({
        kind: 'skipped',
        id: 'radarr',
        reason: "GitHub answered 403 for o/r's releases",
      });
    });

    it('reads a build date from the image’s config (amd64’s for a multi-arch index)', async () => {
      const seen: string[] = [];
      const registry = new Registry(async (url) => {
        seen.push(url.replace('https://registry.example/v2/o/app/', ''));
        if (url.endsWith('/manifests/1.0'))
          return Response.json({
            manifests: [
              { digest: 'sha256:arm', platform: { os: 'linux', architecture: 'arm64' } },
              { digest: 'sha256:amd', platform: { os: 'linux', architecture: 'amd64' } },
              { digest: 'sha256:att', platform: { os: 'unknown', architecture: 'unknown' } },
            ],
          });
        if (url.endsWith('/manifests/sha256:amd')) return Response.json({ config: { digest: 'sha256:cfg' } });
        if (url.endsWith('/blobs/sha256:cfg')) return Response.json({ created: '2026-11-20T04:00:00Z' });
        if (url.endsWith('/manifests/repro')) return Response.json({ config: { digest: 'sha256:zero' } });
        if (url.endsWith('/blobs/sha256:zero')) return Response.json({ created: '1970-01-01T00:00:01Z' });
        return new Response('', { status: 404 });
      });
      expect(await registry.created('registry.example/o/app:1.0')).toEqual(new Date('2026-11-20T04:00:00Z'));
      expect(seen).toEqual(['manifests/1.0', 'manifests/sha256:amd', 'blobs/sha256:cfg']);
      // Reproducible builds say 1970: no date.
      expect(await registry.created('registry.example/o/app:repro')).toBeNull();
      await expect(registry.created('registry.example/o/app:9')).rejects.toThrow('answered 404');
    });

    it('moves every image that follows the version, and leaves the databases', async () => {
      const { look, asked } = lookups(['v3.2.2', 'v3.4.2', 'v3.5.0-rc.1']);
      const check = await checkApp(immich, look);
      expect(check.kind).toBe('update');
      const plan = (check as { plan: UpdatePlan }).plan;
      expect(plan).toMatchObject({
        id: 'immich',
        fromVersion: '3.2.2',
        toVersion: '3.4.2',
        tag: 'v3.4.2',
        major: false,
      });
      expect(plan.images.map((i) => `${i.service} ${i.to.split('@')[0]}`)).toEqual([
        'immich-server ghcr.io/immich-app/immich-server:v3.4.2',
        'immich-machine-learning ghcr.io/immich-app/immich-machine-learning:v3.4.2',
      ]);
      expect(plan.images.every((i) => /@sha256:[0-9a-f]{64}$/.test(i.to))).toBe(true);
      // Tags are listed once, from the app's main image.
      expect(asked.filter((a) => a.startsWith('tags'))).toEqual(['tags ghcr.io/immich-app/immich-server']);
    });

    it('keeps a tag’s suffix (Nextcloud’s -apache)', async () => {
      const nextcloud: AppForUpdate = {
        id: 'nextcloud',
        name: 'Nextcloud',
        version: '35.0.1',
        platforms: BOTH,
        images: [
          { service: 'app', image: `docker.io/library/nextcloud:35.0.1-apache@${D(5)}` },
          { service: 'cron', image: `docker.io/library/nextcloud:35.0.1-apache@${D(5)}` },
          { service: 'db', image: `docker.io/library/postgres:18-alpine@${D(6)}` },
        ],
      };
      const check = await checkApp(nextcloud, lookups(['35.0.1-apache', '35.0.3-apache', '35.0.3-fpm']).look);
      const plan = (check as { plan: UpdatePlan }).plan;
      expect(plan.toVersion).toBe('35.0.3');
      expect(plan.images.map((i) => i.to.split('@')[0])).toEqual([
        'docker.io/library/nextcloud:35.0.3-apache',
        'docker.io/library/nextcloud:35.0.3-apache',
      ]);
    });

    it('says when it’s up to date, and skips what it can’t move safely', async () => {
      expect(await checkApp(immich, lookups(['v3.2.2']).look)).toEqual({ kind: 'current', id: 'immich' });
      // The new version dropped arm64: not offered (the app's platforms must still be served).
      expect(await checkApp(immich, lookups(['v3.4.2'], ['linux/amd64']).look)).toEqual({
        kind: 'skipped',
        id: 'immich',
        reason: 'ghcr.io/immich-app/immich-server:v3.4.2 has no linux/arm64 image',
      });
      // One of its images has no such tag yet.
      const half = await checkApp(
        immich,
        lookups(['v3.4.2'], BOTH, ['ghcr.io/immich-app/immich-machine-learning:v3.4.2']).look,
      );
      expect(half).toMatchObject({
        kind: 'skipped',
        reason: expect.stringContaining('immich-machine-learning:v3.4.2'),
      });
      // An app whose images don't carry its version.
      const odd = { ...immich, version: '1.0', images: [{ service: 'x', image: `example/app:latest@${D(7)}` }] };
      expect(await checkApp(odd, lookups([]).look)).toMatchObject({
        kind: 'skipped',
        reason: expect.stringContaining('follows its version'),
      });
    });
  });

  describe('opens or updates one pull request per app', () => {
    const plan: UpdatePlan = {
      id: 'immich',
      name: 'Immich',
      fromVersion: '2.9.1',
      toVersion: '3.0.0',
      tag: 'v3.0.0',
      major: true,
      releaseUrl: null,
      images: [
        {
          service: 'immich-server',
          from: `ghcr.io/immich-app/immich-server:v2.9.1@${D(1)}`,
          to: `ghcr.io/immich-app/immich-server:v3.0.0@${D(8)}`,
          platforms: [...BOTH, 'linux/arm/v7'],
        },
      ],
    };

    it('bumps version, revision, tag and digest, and nothing else', () => {
      const manifest = "schema: 1\nid: immich\nname: Immich\nversion: '2.9.1'\nrevision: 3\n# keep me\ntagline: x\n";
      const compose = `# From Immich's compose file\nservices:\n  immich-server:\n    image: ghcr.io/immich-app/immich-server:v2.9.1@${D(1)}\n  redis:\n    image: docker.io/valkey/valkey:9@${D(3)}\n`;
      const out = applyPlan(manifest, compose, plan);
      expect(out.manifest).toBe(
        "schema: 1\nid: immich\nname: Immich\nversion: '3.0.0'\nrevision: 1\n# keep me\ntagline: x\n",
      );
      expect(out.compose).toBe(compose.replace(`v2.9.1@${D(1)}`, `v3.0.0@${D(8)}`));
    });

    it('links the release notes and says whether it looks like a major version change', () => {
      const body = prBody(plan, 'https://github.com/immich-app/immich/releases/tag/v3.0.0');
      expect(body).toContain('Updates **Immich** (`store/apps/immich`) from 2.9.1 to **3.0.0**.');
      expect(body).toContain('`ghcr.io/immich-app/immich-server:v2.9.1` → `ghcr.io/immich-app/immich-server:v3.0.0`');
      expect(body).toContain('linux/amd64, linux/arm64)');
      expect(body).toContain('Release notes: https://github.com/immich-app/immich/releases/tag/v3.0.0');
      expect(body).toContain('**This looks like a major version change** (2.9.1 → 3.0.0)');
      expect(body).toContain('it is never merged automatically');
      expect(prBody({ ...plan, major: false, toVersion: '2.9.2' }, null)).toContain(
        'Not a major version change (2.9.1 → 2.9.2).',
      );
      expect(isMajor('0.107.79', '1.0.0')).toBe(true);
      expect(isMajor('0.11.4', '0.13.4')).toBe(true);
      expect(isMajor('1.27.3', '1.28.0')).toBe(false);
      expect(isMajor('2026.9.4', '2026.11.2')).toBe(false);
    });

    function fakeOps(open: { number: number; title: string } | null) {
      const calls: string[] = [];
      const ops: PullRequestOps = {
        openPullRequest: (branch) => (calls.push(`find ${branch}`), open),
        pushBranch: (branch, files, message) =>
          void calls.push(`push ${branch} ${Object.keys(files).join(',')} "${message}"`),
        create: (branch, title, _body, labels) => (calls.push(`create ${branch} "${title}" ${labels.join(',')}`), 12),
        edit: (number, title, _body, labels) => void calls.push(`edit #${number} "${title}" ${labels.join(',')}`),
      };
      return { ops, calls };
    }
    const files = { 'store/apps/immich/hlabs-app.yml': 'm', 'store/apps/immich/docker-compose.yml': 'c' };

    it('opens one on store-update/<id>, labelled', () => {
      const { ops, calls } = fakeOps(null);
      expect(proposeUpdate(plan, files, null, ops)).toEqual({ action: 'opened', number: 12 });
      expect(calls).toEqual([
        'find store-update/immich',
        'push store-update/immich store/apps/immich/hlabs-app.yml,store/apps/immich/docker-compose.yml "Store: update Immich to 3.0.0"',
        'create store-update/immich "Store: update Immich to 3.0.0" store-update,store-update-major',
      ]);
    });

    it('updates the open one when a newer version came out, and leaves it when nothing changed', () => {
      const older = fakeOps({ number: 9, title: 'Store: update Immich to 2.9.5' });
      expect(proposeUpdate(plan, files, null, older.ops)).toEqual({ action: 'updated', number: 9 });
      expect(older.calls.at(-1)).toBe('edit #9 "Store: update Immich to 3.0.0" store-update,store-update-major');
      const same = fakeOps({ number: 9, title: 'Store: update Immich to 3.0.0' });
      expect(proposeUpdate(plan, files, null, same.ops)).toEqual({ action: 'unchanged', number: 9 });
      expect(same.calls).toEqual(['find store-update/immich']);
    });
  });

  it('leaves apps under `hold` in curation.yml alone', () => {
    const curation = StoreCuration.parse({ hold: ['immich'] });
    expect(curation.hold).toEqual(['immich']);
    expect(curationIssues(StoreCuration.parse({ hold: ['nope'] }), new Set(['immich'])).map((i) => i.path)).toEqual([
      'hold[0]',
    ]);
    const store = parse(readFileSync(resolve(ROOT, 'store/curation.yml'), 'utf8')) as { hold?: unknown };
    expect(Array.isArray(store.hold)).toBe(true);
    const cli = readFileSync(resolve(import.meta.dirname, '../src/cli/store-updates.ts'), 'utf8');
    expect(cli).toContain("check = { kind: 'skipped', id: app.id, reason: 'held in curation.yml' }");
  });

  it('runs daily and by hand from store-updates.yml, and never merges', () => {
    const text = readFileSync(resolve(ROOT, '.github/workflows/store-updates.yml'), 'utf8');
    const yml = parse(text) as {
      on: { schedule: Array<{ cron: string }>; workflow_dispatch: { inputs: { apps: unknown } } };
      permissions: Record<string, string>;
      jobs: { updates: { steps: Array<{ run?: string; env?: Record<string, string> }> } };
    };
    expect(yml.on.schedule[0]!.cron).toMatch(/^\d+ \d+ \* \* \*$/);
    expect(yml.on.workflow_dispatch.inputs.apps).toBeTruthy();
    expect(yml.permissions).toMatchObject({ contents: 'write', 'pull-requests': 'write' });
    const step = yml.jobs.updates.steps.find((s) => s.run?.includes('store:updates'))!;
    expect(step.run).toBe('pnpm store:updates --pr ${APPS:+--apps "$APPS"}');
    expect(step.env!.STORE_UPDATES_DISPATCH).toBe("${{ secrets.STORE_UPDATES_TOKEN == '' && '1' || '' }}");
    expect(text).not.toMatch(/pr merge|auto-?merge/i);
  });
});
