import { describe, expect, it } from 'vitest';
import { parseShortVolume, validateCompose } from '../src/compose';
import { AppManifest, type AppManifestInput } from '../src/manifest';

const DIGEST = '@sha256:' + 'a'.repeat(64);

function manifest(patch: Partial<AppManifestInput> = {}) {
  return AppManifest.parse({
    schema: 1,
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    tagline: 'A demo',
    description: 'A demo app',
    category: 'other',
    developer: { name: 'Demo' },
    platforms: ['linux/amd64'],
    web: { service: 'web', port: 8080 },
    folders: [{ key: 'media', label: 'Media', target: '/media' }],
    ports: [{ service: 'web', container: 53, protocol: 'udp', host: 53, label: 'DNS' }],
    ...patch,
  });
}

const web = (svc: Record<string, unknown>) => ({ services: { web: { image: `demo/web:1.0${DIGEST}`, ...svc } } });
const codes = (compose: unknown, m = manifest(), requireDigest = true) =>
  validateCompose(compose, m, { requireDigest }).map((i) => i.code);

describe('validateCompose (06 §Compose rules)', () => {
  it('accepts app data, declared folders, tmpfs and declared raw ports', () => {
    expect(
      codes(
        web({
          volumes: [
            '${HLABS_APP_DATA}/config:/config',
            '${HLABS_FOLDER_MEDIA}:/media:ro',
            { type: 'bind', source: '${HLABS_APP_DATA}', target: '/data' },
            { type: 'tmpfs', target: '/tmp' },
          ],
          ports: ['53:53/udp'],
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    ['privileged', web({ privileged: true }), 'PRIVILEGED'],
    ['host network', web({ network_mode: 'host' }), 'HOST_NETWORK'],
    ['host pid', web({ pid: 'host' }), 'HOST_PID'],
    ['host ipc', web({ ipc: 'host' }), 'HOST_IPC'],
    ['a build', web({ build: '.' }), 'SERVICE_BUILD'],
    ['container_name', web({ container_name: 'x' }), 'CONTAINER_NAME'],
    ['env_file', web({ env_file: ['.env'] }), 'ENV_FILE'],
    ['an undeclared port', web({ ports: ['8080:8080'] }), 'PORT_NOT_DECLARED'],
    ['a host path', web({ volumes: ['/etc/localtime:/etc/localtime:ro'] }), 'BIND_MOUNT_NOT_ALLOWED'],
    ['a relative path', web({ volumes: ['./data:/data'] }), 'BIND_MOUNT_NOT_ALLOWED'],
    ['path traversal', web({ volumes: ['${HLABS_APP_DATA}/../x:/x'] }), 'BIND_MOUNT_NOT_ALLOWED'],
    ['a named volume', web({ volumes: ['cache:/cache'] }), 'NAMED_VOLUME'],
    ['an anonymous volume', web({ volumes: ['/cache'] }), 'NAMED_VOLUME'],
    ['an undeclared folder', web({ volumes: ['${HLABS_FOLDER_MUSIC}:/music'] }), 'UNKNOWN_FOLDER'],
    ['the docker socket', web({ volumes: ['/var/run/docker.sock:/var/run/docker.sock'] }), 'DOCKER_SOCKET'],
    ['an unpinned image', { services: { web: { image: 'demo/web:latest' } } }, 'IMAGE_NOT_PINNED'],
    ['a digest without a tag', { services: { web: { image: `demo/web${DIGEST}` } } }, 'IMAGE_NOT_PINNED'],
    ['no services', { services: {} }, 'COMPOSE_INVALID'],
  ])('rejects %s', (_name, compose, code) => {
    expect(codes(compose)).toContain(code);
  });

  it('allows the docker socket only when the manifest declares it', () => {
    const compose = web({ volumes: ['/var/run/docker.sock:/var/run/docker.sock:ro'] });
    expect(codes(compose, manifest({ permissions: { dockerSocket: true } }))).toEqual([]);
  });

  it('lets custom apps skip digest pinning', () => {
    expect(codes({ services: { web: { image: 'demo/web:latest' } } }, manifest(), false)).toEqual([]);
  });

  it('checks that services named in the manifest exist', () => {
    const m = manifest({ health: { service: 'api', http: '/' }, backup: { pause: ['worker'] } });
    const issues = validateCompose(web({}), m, { requireDigest: true });
    expect(issues.filter((i) => i.code === 'MANIFEST_SERVICE_MISSING').map((i) => i.path)).toEqual([
      'manifest.health.service',
      'manifest.backup.pause[0]',
    ]);
  });
});

describe('parseShortVolume', () => {
  it('keeps ${VAR:-default} sources whole', () => {
    expect(parseShortVolume('${HLABS_APP_DATA:-/x}/db:/var/lib/db:rw')).toEqual({
      source: '${HLABS_APP_DATA:-/x}/db',
      target: '/var/lib/db',
    });
    expect(parseShortVolume('/cache')).toEqual({ source: null, target: '/cache' });
  });
});
