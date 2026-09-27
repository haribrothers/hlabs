import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createSecretStore,
  defaultSecretStoreKind,
  FileSecretStore,
  KEYCHAIN_SERVICE,
  KeychainSecretStore,
} from '../src/platform/secrets';
import { tempDir } from './helpers';

const keychain = vi.hoisted(() => new Map<string, string>());
vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    private readonly id: string;
    constructor(service: string, account: string) {
      this.id = `${service}/${account}`;
    }
    getPassword() {
      return keychain.get(this.id) ?? null;
    }
    setPassword(value: string) {
      keychain.set(this.id, value);
    }
    deleteCredential() {
      return keychain.delete(this.id);
    }
  },
}));

describe('FileSecretStore', () => {
  it('round-trips values and keeps them across instances', async () => {
    const dir = tempDir();
    await new FileSecretStore(dir).set('a', 'first secret');
    const again = new FileSecretStore(dir);
    expect(await again.get('a')).toBe('first secret');
    expect(await again.get('missing')).toBeNull();
    await again.delete('a');
    expect(await new FileSecretStore(dir).get('a')).toBeNull();
  });

  it('never writes the plain value and keeps both files at mode 0600', async () => {
    const dir = tempDir();
    await new FileSecretStore(dir).set('token', 'plain-text-value');
    expect(readFileSync(join(dir, 'secrets.enc'), 'utf8')).not.toContain('plain-text-value');
    expect(statSync(join(dir, 'secrets.enc')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'secret.key')).mode & 0o777).toBe(0o600);
  });

  it('rejects tampered data and values moved to another ref', async () => {
    const dir = tempDir();
    const store = new FileSecretStore(dir);
    await store.set('a', 'value a');
    await store.set('b', 'value b');
    const path = join(dir, 'secrets.enc');
    const sealed = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...sealed, b: sealed.a }));
    await expect(store.get('b')).rejects.toThrow();
  });

  it('cannot read values with another key', async () => {
    const dir = tempDir();
    await new FileSecretStore(dir).set('a', 'value');
    writeFileSync(join(dir, 'secret.key'), Buffer.alloc(32, 1));
    await expect(new FileSecretStore(dir).get('a')).rejects.toThrow();
  });
});

describe('KeychainSecretStore', () => {
  it('stores each ref as an entry under the dev.hlabs service', async () => {
    const store = new KeychainSecretStore();
    await store.set('onboarding.setupToken', 'abc');
    expect(keychain.get(`${KEYCHAIN_SERVICE}/onboarding.setupToken`)).toBe('abc');
    expect(await store.get('onboarding.setupToken')).toBe('abc');
    await store.delete('onboarding.setupToken');
    expect(await store.get('onboarding.setupToken')).toBeNull();
  });
});

describe('choosing a secret store', () => {
  it('uses the keychain only for a production desktop install', () => {
    expect(defaultSecretStoreKind({ env: 'production', headless: false })).toBe('keychain');
    expect(defaultSecretStoreKind({ env: 'production', headless: true })).toBe('file');
    expect(defaultSecretStoreKind({ env: 'development', headless: false })).toBe('file');
    expect(defaultSecretStoreKind({ env: 'test', headless: false })).toBe('file');
  });

  it('creates the chosen backend', () => {
    expect(createSecretStore('file', tempDir())).toBeInstanceOf(FileSecretStore);
    expect(createSecretStore('keychain', tempDir())).toBeInstanceOf(KeychainSecretStore);
  });
});
