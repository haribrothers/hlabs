// US-STORE-23 · the store's 100 apps (D-161, D-163): devices and Linux capabilities only as the manifest declares
// them, passed in only when the device is on this computer, risky at install and in an update's new access.
import { describe, expect, it } from 'vitest';
import { newAccess } from '../src/access';
import { validateCompose } from '../src/compose';
import { AppManifest, hasRiskyPermissions, type AppManifestInput } from '../src/manifest';
import { renderApp } from '../src/render';

const DIGEST = '@sha256:' + 'a'.repeat(64);

function manifest(permissions: Record<string, unknown> = {}, patch: Partial<AppManifestInput> = {}) {
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
    permissions,
    ...patch,
  });
}

const ZIGBEE = { path: '/dev/ttyUSB0', label: 'Zigbee USB adapter' };
const web = (svc: Record<string, unknown>) => ({ services: { web: { image: `demo/web:1.0${DIGEST}`, ...svc } } });
const codes = (compose: unknown, m: AppManifest) =>
  validateCompose(compose, m, { requireDigest: true }).map((i) => i.code);

describe('US-STORE-23 devices and capabilities (D-163)', () => {
  it('refuses devices, capabilities, sysctls, security options and host namespaces the manifest does not declare', () => {
    const m = manifest();
    expect(codes(web({ devices: ['/dev/ttyUSB0:/dev/ttyUSB0'] }), m)).toEqual(['DEVICE_NOT_DECLARED']);
    expect(codes(web({ cap_add: ['NET_ADMIN'] }), m)).toEqual(['CAPABILITY_NOT_DECLARED']);
    expect(codes(web({ cap_add: ['SYS_ADMIN'] }), manifest({ capabilities: ['NET_ADMIN'] }))).toEqual([
      'CAPABILITY_NOT_DECLARED',
    ]);
    expect(codes(web({ sysctls: ['net.ipv4.ip_forward=1'] }), m)).toEqual(['SYSCTL_NOT_ALLOWED']);
    expect(codes(web({ security_opt: ['seccomp:unconfined'] }), m)).toEqual(['SECURITY_OPT_NOT_ALLOWED']);
    expect(codes(web({ userns_mode: 'host', uts: 'host', cgroup: 'host' }), m)).toEqual([
      'HOST_NAMESPACE',
      'HOST_NAMESPACE',
      'HOST_NAMESPACE',
    ]);
  });

  it('accepts what is declared: a device, NET_ADMIN with network sysctls, and no-new-privileges', () => {
    const m = manifest({ devices: [ZIGBEE], capabilities: ['NET_ADMIN'] });
    expect(
      codes(
        web({
          devices: ['/dev/ttyUSB0:/dev/ttyUSB0'],
          cap_add: ['NET_ADMIN'],
          sysctls: { 'net.ipv4.ip_forward': 1, 'net.ipv4.conf.all.src_valid_mark': 1 },
          security_opt: ['no-new-privileges:true'],
          cap_drop: ['ALL'],
        }),
        m,
      ),
    ).toEqual([]);
    // Network settings only: not kernel ones, even with NET_ADMIN.
    expect(codes(web({ cap_add: ['NET_ADMIN'], sysctls: ['kernel.shmmax=1'] }), m)).toEqual(['SYSCTL_NOT_ALLOWED']);
  });

  it('passes in only the devices that are on this computer', () => {
    const m = manifest({ devices: [ZIGBEE, { path: '/dev/ttyACM0', label: 'Zigbee USB adapter (ACM)' }] });
    const render = (presentDevices: string[]) =>
      renderApp({
        manifest: m,
        compose: web({ devices: ['/dev/ttyUSB0:/dev/ttyUSB0', '/dev/ttyACM0:/dev/ttyACM0'] }) as never,
        webPort: 13000,
        appDataDir: '/data/demo',
        folders: {},
        hostname: 'demo.hlabs.local',
        url: 'https://demo.hlabs.local',
        tz: 'UTC',
        puid: 1000,
        pgid: 1000,
        env: {},
        presentDevices,
      }).compose as { services: { web: { devices?: string[] } } };
    expect(render(['/dev/ttyACM0']).services.web.devices).toEqual(['/dev/ttyACM0:/dev/ttyACM0']);
    // A Mac has none: the app installs without them.
    expect(render([]).services.web.devices).toBeUndefined();
  });

  it('devices and capabilities are risky, and an update that adds one asks for new access', () => {
    expect(hasRiskyPermissions(manifest())).toBe(false);
    expect(hasRiskyPermissions(manifest({ devices: [ZIGBEE] }))).toBe(true);
    expect(hasRiskyPermissions(manifest({ capabilities: ['NET_ADMIN'] }))).toBe(true);
    const before = manifest({ devices: [ZIGBEE] });
    const after = manifest({
      devices: [ZIGBEE, { path: '/dev/ttyACM0', label: 'Zigbee USB adapter (ACM)' }],
      capabilities: ['NET_ADMIN'],
    });
    expect(newAccess(before, after)?.permissions).toMatchObject({
      devices: [{ path: '/dev/ttyACM0', label: 'Zigbee USB adapter (ACM)' }],
      capabilities: ['NET_ADMIN'],
    });
    expect(newAccess(after, after)).toBeNull();
  });

  it('a capability outside the allow-list is not a manifest at all', () => {
    expect(() => manifest({ capabilities: ['SYS_ADMIN'] })).toThrow();
    expect(() => manifest({ devices: [{ path: '/etc/passwd', label: 'Not a device' }] })).toThrow();
  });
});
