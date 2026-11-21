// US-INST-27 · First run on a Linux desktop, the daemon's side (D-145): secrets go in Secret Service, or in the
// encrypted file store when Secret Service doesn't answer; a Mac always uses the keychain.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSecretStore, FileSecretStore, keychainAnswers, KeychainSecretStore } from '../src/platform/secrets';

describe('US-INST-27', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'us-inst-27-'));

  it('uses Secret Service on a Linux desktop when it answers, the encrypted file when it doesn’t', async () => {
    expect(createSecretStore('keychain', dir(), { platform: 'linux', answers: () => true })).toBeInstanceOf(
      KeychainSecretStore,
    );
    const fallback = createSecretStore('keychain', dir(), { platform: 'linux', answers: () => false });
    expect(fallback).toBeInstanceOf(FileSecretStore);
    await fallback.set('setup-token', 'abc');
    expect(await fallback.get('setup-token')).toBe('abc');
    expect(createSecretStore('keychain', dir(), { platform: 'darwin', answers: () => false })).toBeInstanceOf(
      KeychainSecretStore,
    );
  });

  it('a missing entry counts as answering; an error does not', () => {
    expect(keychainAnswers(() => ({ getPassword: () => null }))).toBe(true);
    expect(
      keychainAnswers(() => ({
        getPassword: () => {
          throw new Error('org.freedesktop.secrets was not provided by any .service files');
        },
      })),
    ).toBe(false);
  });
});
