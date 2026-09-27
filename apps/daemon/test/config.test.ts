import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { defaultPaths } from '../src/platform/paths';

describe('config', () => {
  it('always binds to loopback on 7474 by default', () => {
    const c = loadConfig({ HLABS_DATA_DIR: '/tmp/x' });
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(7474);
    expect(c.paths.dataDir).toBe('/tmp/x');
  });

  it('refuses the dev anonymous flag in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', HLABS_DEV_ANONYMOUS_ADMIN: '1' })).toThrow(/development only/);
    expect(loadConfig({ NODE_ENV: 'development', HLABS_DEV_ANONYMOUS_ADMIN: '1' }).devAnonymousAdmin).toBe(true);
  });

  it('builds the dashboard URL from the port unless it is set', () => {
    expect(loadConfig({ HLABS_PORT: '7480' }).dashboardUrl).toBe('http://127.0.0.1:7480');
    expect(loadConfig({ HLABS_DASHBOARD_URL: 'http://127.0.0.1:5173/' }).dashboardUrl).toBe('http://127.0.0.1:5173');
  });

  it('keeps secrets in the keychain on a production desktop and in the encrypted file otherwise', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).secretStore).toBe('keychain');
    expect(loadConfig({ NODE_ENV: 'production', HLABS_HEADLESS: '1' }).secretStore).toBe('file');
    expect(loadConfig({ NODE_ENV: 'development' }).secretStore).toBe('file');
    expect(loadConfig({ NODE_ENV: 'production', HLABS_SECRET_STORE: 'file' }).secretStore).toBe('file');
  });
});

describe('platform paths (02 §2.3)', () => {
  it('uses Application Support on macOS', () => {
    expect(defaultPaths({ platform: 'darwin', home: '/Users/h', headless: false })).toEqual({
      dataDir: '/Users/h/Library/Application Support/hlabs',
      storageRootDefault: '/Users/h/hlabs',
      appDataDir: '/Users/h/hlabs/app-data',
    });
  });

  it('uses XDG data on Linux desktop and /var/lib/hlabs headless', () => {
    expect(defaultPaths({ platform: 'linux', home: '/home/h', headless: false }).dataDir).toBe(
      '/home/h/.local/share/hlabs',
    );
    expect(defaultPaths({ platform: 'linux', home: '/home/h', headless: true })).toEqual({
      dataDir: '/var/lib/hlabs',
      storageRootDefault: '/var/lib/hlabs/storage',
      appDataDir: '/var/lib/hlabs/app-data',
    });
  });
});
