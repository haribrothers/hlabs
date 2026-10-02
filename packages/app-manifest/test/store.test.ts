import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStoreIndex, curationIssues, lintStore, loadAppDir, loadCuration } from '../src/node';
import { renderApp, serializeEnvFile } from '../src/render';

const STORE = fileURLToPath(new URL('../../../store', import.meta.url));
const SAMPLE_APPS = ['immich', 'uptime-kuma', 'vaultwarden'];

describe('built-in store', () => {
  const apps = lintStore(STORE);

  it('has the sample apps and every one passes store:lint', () => {
    expect(apps.map((a) => a.manifest?.id).sort()).toEqual(expect.arrayContaining(SAMPLE_APPS));
    for (const app of apps) expect(app.issues, app.dir).toEqual([]);
  });

  it('builds an index with a digest per app', () => {
    const index = buildStoreIndex(STORE, { id: 'builtin', name: 'hlabs' });
    const immich = index.apps.find((a) => a.id === 'immich');
    expect(immich).toMatchObject({
      version: '3.2.2',
      manifestUrl: 'apps/immich/hlabs-app.yml',
      composeUrl: 'apps/immich/docker-compose.yml',
      logoUrl: 'apps/immich/logo.svg',
    });
    expect(immich?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('writes the curation into the index: featured apps, rows and rank (US-STORE-01)', () => {
    const index = buildStoreIndex(STORE, { id: 'builtin', name: 'hlabs' });
    const curation = loadCuration(STORE);
    expect(index.featured).toEqual(curation.featured);
    expect(index.collections).toEqual(curation.collections);
    expect(index.apps.find((a) => a.id === curation.rank[0])?.rank).toBe(0);
    expect(curationIssues(curation, new Set(apps.map((a) => a.manifest!.id)))).toEqual([]);
  });

  describe.each(SAMPLE_APPS)('rendering %s', (id) => {
    const app = loadAppDir(`${STORE}/apps/${id}`, { requireDigest: true });
    const rendered = renderApp({
      manifest: app.manifest!,
      compose: app.compose!,
      webPort: 12001,
      appDataDir: `/home/hari/hlabs/app-data/${id}`,
      folders: { library: '/home/hari/hlabs/users/hari/Photos' },
      hostname: `${id}.hlabs.local`,
      url: `https://${id}.hlabs.local`,
      tz: 'Europe/London',
      puid: 1000,
      pgid: 1000,
      env: { DB_PASSWORD: 'generated-secret', SIGNUPS_ALLOWED: 'true' },
    });

    it('matches the snapshot', () => {
      expect(rendered.composeYaml).toMatchSnapshot();
      expect(rendered.envFile).toMatchSnapshot();
    });

    it('injects the hlabs parts', () => {
      const compose = parse(rendered.composeYaml);
      const webService = compose.services[app.manifest!.web.service];
      expect(compose.name).toBe(`hlabs-${id}`);
      expect(compose.networks.hlabs).toEqual({ external: true, name: 'hlabs' });
      expect(webService.ports).toEqual([`127.0.0.1:12001:${app.manifest!.web.port}`]);
      expect(webService.networks).toContain('hlabs');
      type Svc = { labels: object; restart: string; logging: object; environment: { TZ: string }; ports?: string[] };
      for (const [name, svc] of Object.entries<Svc>(compose.services)) {
        expect(svc.labels).toMatchObject({ 'dev.hlabs.app': id, 'dev.hlabs.service': name });
        expect(svc.restart).toBe('unless-stopped');
        expect(svc.logging).toEqual({ driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } });
        expect(svc.environment.TZ).toBe('${TZ}');
        // Only the web service is published, and only on loopback (D-049).
        if (name !== app.manifest!.web.service) expect(svc.ports).toBeUndefined();
      }
    });
  });
});

describe('serializeEnvFile', () => {
  it('quotes values so compose reads them literally', () => {
    expect(serializeEnvFile({ A: "it's $HOME", B: '' })).toBe("A='it'\\''s $HOME'\nB=''\n");
  });
});

describe('curation.yml', () => {
  it('is optional, and names only apps in the store', () => {
    const dir = join(tmpdir(), `curation-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    expect(loadCuration(dir)).toEqual({ featured: [], collections: [], rank: [] });
    writeFileSync(
      join(dir, 'curation.yml'),
      'featured: [immich, ghost]\ncollections:\n  - { id: best, title: Best, appIds: [ghost] }\n',
    );
    expect(curationIssues(loadCuration(dir), new Set(['immich'])).map((i) => i.path)).toEqual([
      'featured[1]',
      'collections[0].appIds[0]',
    ]);
    writeFileSync(join(dir, 'curation.yml'), 'featured: [Not An Id]\n');
    expect(() => loadCuration(dir)).toThrow();
  });
});
