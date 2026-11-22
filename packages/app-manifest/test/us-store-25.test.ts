// US-STORE-25 · Port an app with the porting helper. The draft from a Runtipi, CasaOS or upstream definition
// (src/port.ts), the TODOs `pnpm store:lint` refuses, the NOTICE and ATTRIBUTION.md, and the registry lookups that
// pin images (src/registry.ts). Fixtures are copies of real definitions (test/fixtures/port/NOTICE); nothing here
// reaches the network.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { attributionIssues, findTodos, loadAppDir } from '../src/node';
import { attributedApps, parseFrom, portApp, withAttribution, type PortInput } from '../src/port';
import { parseImageRef, Registry } from '../src/registry';

/** A draft manifest, read loosely in assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions walk the draft freely
type Draft = Record<string, any>;

const FIX = resolve(import.meta.dirname, 'fixtures/port');
const json = (file: string) => JSON.parse(readFileSync(join(FIX, file), 'utf8'));
const yaml = (file: string) => parse(readFileSync(join(FIX, file), 'utf8'));
const BOTH = ['linux/amd64', 'linux/arm64', 'linux/arm/v7'];
const pin = (n: number, platforms = BOTH) => ({ digest: `sha256:${String(n).repeat(64).slice(0, 64)}`, platforms });

function runtipi(dir: string, id: string, images: PortInput['images']): PortInput {
  return {
    id,
    from: { kind: 'runtipi', id },
    runtipi: { config: json(`${dir}/config.json`), dynamic: json(`${dir}/docker-compose.json`) },
    commit: 'de46994842935e3bd3493bc946b8959fff9ae398',
    license: 'AGPL-3.0',
    logoFile: null,
    images,
  };
}

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
/** Writes a draft to a store folder and lints it as `pnpm store:lint` does. */
function writeDraft(
  id: string,
  draft: ReturnType<typeof portApp>,
  resolveTodos?: (m: Record<string, unknown>) => void,
) {
  const store = mkdtempSync(join(tmpdir(), 'us-store-25-'));
  dirs.push(store);
  const dir = join(store, 'apps', id);
  mkdirSync(dir, { recursive: true });
  const manifest = structuredClone(draft.manifest);
  resolveTodos?.(manifest);
  writeFileSync(join(dir, 'hlabs-app.yml'), stringify(manifest));
  writeFileSync(join(dir, 'docker-compose.yml'), stringify(draft.compose));
  writeFileSync(join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  if (draft.notice) writeFileSync(join(dir, 'NOTICE'), draft.notice);
  if (draft.attribution) writeFileSync(join(store, 'ATTRIBUTION.md'), withAttribution(null, draft.attribution));
  return { store, app: loadAppDir(dir, { requireDigest: true }) };
}

describe('US-STORE-25', () => {
  describe('drafts store/apps/<id>/ from a Runtipi definition', () => {
    const draft = portApp(runtipi('runtipi-vaultwarden', 'vaultwarden', { 'vaultwarden/server:1.37.5': pin(1) }));

    it('fills in what the definition says', () => {
      const m = draft.manifest;
      expect(m).toMatchObject({
        schema: 1,
        id: 'vaultwarden',
        name: 'VaultWarden',
        version: '1.37.5',
        tagline: 'All your passwords in your control!',
        developer: { name: 'Daniel García', url: 'https://github.com/dani-garcia/vaultwarden' },
        source: 'https://github.com/dani-garcia/vaultwarden',
        license: 'AGPL-3.0',
        platforms: ['linux/amd64', 'linux/arm64'],
        web: { service: 'vaultwarden', port: 80, embed: true },
        permissions: { network: 'internet' },
      });
      // Its setting becomes an env prompt: a password is a secret.
      expect(m.env).toEqual([
        {
          key: 'VAULTWARDEN_ADMIN_PASSWORD',
          label: 'Admin Panel Password',
          description: 'Check the app description for more details',
          type: 'secret',
          required: true,
        },
      ]);
    });

    it('writes a compose file under hlabs’s rules', () => {
      expect(draft.compose).toEqual({
        services: {
          vaultwarden: {
            image: `vaultwarden/server:1.37.5@${pin(1).digest}`,
            environment: { WEBSOCKET_ENABLED: 'true', ADMIN_TOKEN: '${VAULTWARDEN_ADMIN_PASSWORD}' },
            volumes: ['${HLABS_APP_DATA}/data:/data'],
          },
        },
      });
    });

    it('credits Runtipi in a NOTICE and ATTRIBUTION.md', () => {
      expect(draft.notice).toContain("drafted from the Runtipi app store's definition");
      expect(draft.notice).toContain(
        'Source: https://github.com/runtipi/runtipi-appstore/tree/de46994842935e3bd3493bc946b8959fff9ae398/apps/vaultwarden',
      );
      expect(draft.notice).toContain('Licence: GNU General Public License v3.0 (GPL-3.0).');
      expect(draft.attribution).toEqual({ id: 'vaultwarden', from: 'Runtipi app store', license: 'GPL-3.0' });
    });

    it('leaves a TODO for what it can’t decide', () => {
      const todos = findTodos(draft.manifest).map((t) => t.path);
      expect(todos).toEqual(['description', 'category', 'icon.logo', 'ownLogin']);
      expect(draft.manifest.ownLogin).toMatch(/^TODO: true if the app asks people to sign in itself/);
      expect(draft.manifest.description).toContain('The source says: Alternative implementation of the Bitwarden');
      expect(draft.manifest.category).toContain('(the source says utilities)');
    });
  });

  it('turns the person’s files into a folder request, shared by every service that mounts them', () => {
    const draft = portApp(
      runtipi('runtipi-immich', 'immich', {
        'ghcr.io/immich-app/immich-server:v3.4.2': pin(1),
        'ghcr.io/immich-app/immich-machine-learning:v3.4.2': pin(2),
        'redis:6.2': pin(3),
        'ghcr.io/immich-app/postgres:14-vectorchord0.3.0-pgvectors0.2.0': pin(4),
      }),
    );
    const m = draft.manifest as {
      folders: Array<Record<string, unknown>>;
      env: unknown[];
      category: string;
      version: string;
    };
    expect(m.category).toBe('photos'); // "data, photography": the specific one
    expect(m.version).toBe('3.4.2');
    expect(m.folders).toHaveLength(1);
    expect(m.folders[0]).toMatchObject({ key: 'upload', target: '/usr/src/app/upload', mode: 'rw', required: true });
    expect(m.folders[0]!.label).toMatch(/^TODO: what people call this folder/);
    expect(m.folders[0]!.default).toBe('TODO: home:<dir>, shared:<dir> or appdata:<dir>');
    const s = draft.compose.services;
    expect(s.immich!.volumes).toEqual(['${HLABS_FOLDER_UPLOAD}:/usr/src/app/upload']);
    expect(s['immich-machine-learning']!.volumes).toEqual([
      '${HLABS_FOLDER_UPLOAD}:/usr/src/app/upload',
      '${HLABS_APP_DATA}/immich-ml-cache:/cache',
    ]);
    expect(s.immich!.depends_on).toEqual(['immich-redis', 'immich-db']);
    expect(s['immich-redis']!.healthcheck).toEqual({ test: 'redis-cli ping || exit 1' });
    // Runtipi's random values are generated once and hidden (06 · env).
    expect(m.env).toContainEqual({ key: 'DB_PASSWORD', type: 'secret', generate: true, hidden: true });
  });

  describe('drafts from a CasaOS definition', () => {
    const draft = portApp({
      id: 'jellyfin',
      from: { kind: 'casaos', id: 'Jellyfin' },
      casaos: yaml('casaos-jellyfin.yml'),
      commit: 'abc123',
      license: 'GPL-2.0',
      logoFile: 'logo.svg',
      images: { 'linuxserver/jellyfin:12.2ubu2604-ls53': pin(5) },
    });
    const m = draft.manifest as Draft;

    it('finds the web page from its port map and declares the other ports for a person to check', () => {
      expect(m.web).toEqual({ service: 'jellyfin', port: 8096, embed: true });
      expect(m.ports.map((p: { container: number; host: number }) => `${p.host}:${p.container}`)).toEqual([
        '8921:8920',
        '7359:7359',
        '1901:1900',
      ]);
      expect(m.ports[0].label).toMatch(/^TODO: what port 8920\/tcp is for/);
      expect(draft.compose.services.jellyfin!.ports).toEqual(['8921:8920/tcp', '7359:7359/tcp', '1901:1900/tcp']);
    });

    it('uses hlabs’s variables and drops what hlabs sets itself', () => {
      const svc = draft.compose.services.jellyfin!;
      expect(svc.environment).toEqual({ PGID: '${PGID}', PUID: '${PUID}', TZ: '${TZ}' });
      expect(svc.volumes).toEqual([
        '${HLABS_APP_DATA}/config:/config',
        '${HLABS_FOLDER_MEDIA}:/Media',
        '/opt/vc/lib:/opt/vc/lib',
      ]);
      for (const k of ['restart', 'network_mode', 'deploy', 'x-casaos', 'container_name'])
        expect(svc).not.toHaveProperty(k);
      expect(m).toMatchObject({
        name: 'Jellyfin',
        version: '12.2.0',
        tagline: 'The personal Media System',
        category: 'media',
      });
      expect(m.icon.logo).toBe('logo.svg');
    });

    it('asks about devices and host paths hlabs doesn’t allow', () => {
      expect(m.permissions.gpu).toMatch(/^TODO: the source passes devices/);
      expect(draft.todos).toContainEqual(expect.stringContaining("/opt/vc/lib is a host path hlabs doesn't allow"));
      expect(draft.todos).toContainEqual(expect.stringContaining('services.jellyfin.devices: /dev/dri:/dev/dri'));
    });

    it('credits CasaOS under its licence', () => {
      expect(draft.notice).toContain('https://github.com/IceWhaleTech/CasaOS-AppStore/tree/abc123/Apps/Jellyfin');
      expect(draft.notice).toContain('Apache License 2.0 (Apache-2.0)');
      expect(draft.attribution).toEqual({ id: 'jellyfin', from: 'CasaOS app store', license: 'Apache-2.0' });
    });
  });

  it('drafts from the project’s own compose file, with named volumes moved to app data', () => {
    const draft = portApp({
      id: 'notes',
      from: { kind: 'compose', url: 'https://raw.githubusercontent.com/example/notes/main/docker-compose.yml' },
      compose: yaml('upstream-compose.yml'),
      web: { service: 'app', port: 3000 },
      license: null,
      images: { 'example/notes:2.4.1': pin(6, ['linux/amd64']), 'postgres:latest': pin(7) },
    });
    const m = draft.manifest as Draft;
    expect(draft.compose.services.app).toEqual({
      image: `example/notes:2.4.1@${pin(6).digest}`,
      environment: { DATABASE_URL: 'postgres://notes:notes@db/notes' },
      volumes: ['${HLABS_APP_DATA}/notes-data:/app/data'],
      depends_on: ['db'],
    });
    expect(draft.compose.services.db!.volumes).toEqual(['${HLABS_APP_DATA}/db:/var/lib/postgresql/data']);
    // "latest" can't be updated or rolled back: pin a version.
    expect(draft.compose.services.db!.image).toMatch(/^TODO: pin postgres to a version tag/);
    expect(m).toMatchObject({
      name: 'Notes',
      version: '2.4.1',
      source: 'https://github.com/example/notes',
      web: { service: 'app', port: 3000 },
    });
    expect(m.license).toMatch(/^TODO: the project's licence/);
    // Where every image runs: the app's image has no arm64 build.
    expect(m.platforms).toEqual(['linux/amd64']);
    expect(draft.notice).toBeNull();
    expect(draft.attribution).toBeNull();
  });

  it('says when an app is x86 only (allowed, D-148)', () => {
    const draft = portApp(
      runtipi('runtipi-vaultwarden', 'vaultwarden', { 'vaultwarden/server:1.37.5': pin(1, ['linux/amd64']) }),
    );
    expect(draft.manifest.platforms).toEqual(['linux/amd64']);
    expect(draft.todos).toContainEqual(expect.stringContaining('x86 only'));
  });

  it('never reads Umbrel’s catalogue', () => {
    expect(() => parseFrom('umbrel:jellyfin')).toThrow("Umbrel's app definitions have no licence");
    expect(() => parseFrom('https://github.com/getumbrel/umbrel-apps/blob/master/jellyfin/docker-compose.yml')).toThrow(
      'D-148',
    );
    expect(parseFrom('runtipi:vaultwarden')).toEqual({ kind: 'runtipi', id: 'vaultwarden' });
    expect(parseFrom('casaos:Jellyfin')).toEqual({ kind: 'casaos', id: 'Jellyfin' });
    expect(parseFrom('https://github.com/o/r/blob/main/docker-compose.yml')).toEqual({
      kind: 'compose',
      url: 'https://raw.githubusercontent.com/o/r/main/docker-compose.yml',
    });
  });

  describe('pnpm store:lint fails until a person resolves every TODO', () => {
    const draft = portApp(runtipi('runtipi-vaultwarden', 'vaultwarden', { 'vaultwarden/server:1.37.5': pin(1) }));

    it('reports each TODO, not the schema errors they cause', () => {
      const { app } = writeDraft('vaultwarden', draft);
      expect(app.issues.map((i) => `${i.code} ${i.path}`)).toEqual([
        'TODO_LEFT description',
        'TODO_LEFT category',
        'TODO_LEFT icon.logo',
        'TODO_LEFT ownLogin',
      ]);
    });

    it('passes once they are resolved', () => {
      const { app, store } = writeDraft('vaultwarden', draft, (m) => {
        m.description = 'Keep every password in one place you control, and fill them in from Bitwarden apps.';
        m.category = 'security';
        (m.icon as Record<string, unknown>).logo = 'logo.svg';
        m.ownLogin = true;
      });
      expect(app.issues).toEqual([]);
      expect(attributionIssues(store)).toEqual([]);
    });

    it('reads ATTRIBUTION.md with its table padded into columns, as the formatter leaves it', () => {
      const { store } = writeDraft('vaultwarden', draft);
      const padded = [
        '# Attribution',
        '',
        '| App         | Drafted from      | Licence |',
        '| ----------- | ----------------- | ------- |',
        '| vaultwarden | Runtipi app store | GPL-3.0 |',
        '',
      ].join('\n');
      writeFileSync(join(store, 'ATTRIBUTION.md'), padded);
      expect(attributedApps(padded)).toEqual(['vaultwarden']);
      expect(attributionIssues(store)).toEqual([]);
      const next = withAttribution(padded, { id: 'sonarr', from: 'Runtipi app store', license: 'GPL-3.0' });
      expect(attributedApps(next)).toEqual(['sonarr', 'vaultwarden']);
    });

    it('checks the NOTICE and ATTRIBUTION.md go together', () => {
      const { store } = writeDraft('vaultwarden', draft);
      rmSync(join(store, 'ATTRIBUTION.md'));
      expect(attributionIssues(store).map((i) => i.code)).toEqual(['ATTRIBUTION_MISSING']);
      writeFileSync(
        join(store, 'ATTRIBUTION.md'),
        withAttribution(null, { id: 'gone', from: 'Runtipi app store', license: 'GPL-3.0' }),
      );
      rmSync(join(store, 'apps/vaultwarden/NOTICE'));
      expect(attributionIssues(store).map((i) => `${i.code} ${i.path}`)).toEqual(['NOTICE_MISSING gone']);
    });

    it('also finds TODOs in the compose file', () => {
      expect(findTodos({ services: { db: { image: 'TODO: pin postgres' } } })).toEqual([
        { path: 'services.db.image', text: 'pin postgres' },
      ]);
    });
  });

  it('keeps ATTRIBUTION.md one row per app, in id order', () => {
    let text = withAttribution(null, { id: 'vaultwarden', from: 'Runtipi app store', license: 'GPL-3.0' });
    text = withAttribution(text, { id: 'jellyfin', from: 'CasaOS app store', license: 'Apache-2.0' });
    text = withAttribution(text, { id: 'vaultwarden', from: 'Runtipi app store', license: 'GPL-3.0' });
    expect(attributedApps(text)).toEqual(['jellyfin', 'vaultwarden']);
    expect(text).toContain('| jellyfin | CasaOS app store | Apache-2.0 |');
  });

  describe('pins images through the registry', () => {
    it('reads image names as compose does', () => {
      expect(parseImageRef('redis:6.2')).toMatchObject({
        registry: 'registry-1.docker.io',
        repository: 'library/redis',
        tag: '6.2',
        name: 'redis',
      });
      expect(parseImageRef('ghcr.io/immich-app/immich-server:v3.4.2')).toMatchObject({
        registry: 'ghcr.io',
        repository: 'immich-app/immich-server',
        tag: 'v3.4.2',
      });
      expect(parseImageRef(`docker.io/valkey/valkey:9@sha256:${'a'.repeat(64)}`)).toMatchObject({
        registry: 'registry-1.docker.io',
        repository: 'valkey/valkey',
        tag: '9',
        digest: `sha256:${'a'.repeat(64)}`,
      });
      expect(parseImageRef('lscr.io/linuxserver/jellyfin')).toMatchObject({ registry: 'lscr.io', tag: null });
    });

    it('gets an anonymous token, the index digest and its platforms (not attestations)', async () => {
      const calls: string[] = [];
      const registry = new Registry(async (url, init) => {
        calls.push(`${url} ${init?.headers?.authorization ?? ''}`.trim());
        if (url.startsWith('https://auth.example/token')) return Response.json({ token: 't0k' });
        if (!init?.headers?.authorization) {
          return new Response('', {
            status: 401,
            headers: {
              'www-authenticate':
                'Bearer realm="https://auth.example/token",service="registry.example",scope="repository:o/app:pull"',
            },
          });
        }
        return new Response(
          JSON.stringify({
            mediaType: 'application/vnd.oci.image.index.v1+json',
            manifests: [
              { platform: { os: 'linux', architecture: 'amd64' } },
              { platform: { os: 'linux', architecture: 'arm64', variant: 'v8' } },
              { platform: { os: 'unknown', architecture: 'unknown' } },
            ],
          }),
          { headers: { 'docker-content-digest': 'sha256:feed' } },
        );
      });
      expect(await registry.manifest('registry.example/o/app:1.0')).toEqual({
        digest: 'sha256:feed',
        platforms: ['linux/amd64', 'linux/arm64'],
      });
      expect(calls).toEqual([
        'https://registry.example/v2/o/app/manifests/1.0',
        'https://auth.example/token?service=registry.example&scope=repository%3Ao%2Fapp%3Apull',
        'https://registry.example/v2/o/app/manifests/1.0 Bearer t0k',
      ]);
    });

    it('reads a one-platform image’s platform from its config, and lists tags across pages', async () => {
      const registry = new Registry(async (url) => {
        if (url.endsWith('/manifests/2'))
          return Response.json(
            { config: { digest: 'sha256:cfg' } },
            { headers: { 'docker-content-digest': 'sha256:one' } },
          );
        if (url.endsWith('/blobs/sha256:cfg')) return Response.json({ os: 'linux', architecture: 'amd64' });
        if (url.endsWith('tags/list?n=1000')) {
          return Response.json(
            { tags: ['1', '2'] },
            { headers: { link: '</v2/o/app/tags/list?n=1000&last=2>; rel="next"' } },
          );
        }
        if (url.endsWith('tags/list?n=1000&last=2')) return Response.json({ tags: ['3'] });
        return new Response('', { status: 404 });
      });
      expect(await registry.manifest('registry.example/o/app:2')).toEqual({
        digest: 'sha256:one',
        platforms: ['linux/amd64'],
      });
      expect(await registry.tags('registry.example/o/app')).toEqual(['1', '2', '3']);
      await expect(registry.manifest('registry.example/o/app:9')).rejects.toThrow(
        "registry.example/o/app:9 doesn't exist",
      );
    });
  });

  it('refuses a bad id or Umbrel before reading anything', { timeout: 60_000 }, () => {
    const store = mkdtempSync(join(tmpdir(), 'us-store-25-cli-'));
    dirs.push(store);
    cpSync(join(FIX, 'NOTICE'), join(store, 'x'));
    const run = (...args: string[]) =>
      spawnSync('npx', ['tsx', 'src/cli/store-port.ts', store, ...args], {
        cwd: resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
      });
    expect(run('Bad_Id', '--from', 'runtipi:x').stderr).toContain(`"Bad_Id" isn't an app id`);
    expect(run('jellyfin', '--from', 'umbrel:jellyfin').stderr).toContain("Umbrel's app definitions have no licence");
    expect(run('jellyfin').stderr).toContain('Usage: pnpm store:port <id> --from');
  });
});
