// Secrets live in the OS keychain (or an encrypted file on headless Linux), never in SQLite (07 §7.7).
import { Entry } from '@napi-rs/keyring';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export interface SecretStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

export type SecretStoreKind = 'keychain' | 'file';

/** Keychain service name (D-050). */
export const KEYCHAIN_SERVICE = 'dev.hlabs';

/** macOS Keychain / Linux Secret Service through @napi-rs/keyring; one entry per ref. */
export class KeychainSecretStore implements SecretStore {
  constructor(private readonly service = KEYCHAIN_SERVICE) {}

  async get(ref: string) {
    return new Entry(this.service, ref).getPassword();
  }
  async set(ref: string, value: string) {
    new Entry(this.service, ref).setPassword(value);
  }
  async delete(ref: string) {
    new Entry(this.service, ref).deleteCredential();
  }
}

const sealedSchema = z.record(z.string(), z.object({ iv: z.string(), tag: z.string(), data: z.string() }));
type Sealed = z.infer<typeof sealedSchema>;

/**
 * AES-256-GCM file store for headless Linux and development: a random 32-byte key in `secret.key`
 * and the sealed values in `secrets.enc`, both mode 0600. Each value is bound to its ref (AAD).
 */
export class FileSecretStore implements SecretStore {
  private readonly keyPath: string;
  private readonly storePath: string;

  constructor(dir: string) {
    this.keyPath = join(dir, 'secret.key');
    this.storePath = join(dir, 'secrets.enc');
  }

  async get(ref: string) {
    const sealed = this.read()[ref];
    if (!sealed) return null;
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(ref));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
  }

  async set(ref: string, value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(ref));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const all = this.read();
    all[ref] = {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
    this.write(all);
  }

  async delete(ref: string) {
    const all = this.read();
    if (!(ref in all)) return;
    delete all[ref];
    this.write(all);
  }

  private key(): Buffer {
    if (!existsSync(this.keyPath)) {
      mkdirSync(dirname(this.keyPath), { recursive: true });
      writeFileSync(this.keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    }
    const key = readFileSync(this.keyPath);
    if (key.length !== 32) throw new Error(`${this.keyPath} is not a 32-byte key`);
    return key;
  }

  private read(): Sealed {
    if (!existsSync(this.storePath)) return {};
    return sealedSchema.parse(JSON.parse(readFileSync(this.storePath, 'utf8')));
  }

  private write(all: Sealed) {
    const tmp = `${this.storePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.storePath);
  }
}

/** In-memory store for tests. */
export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();
  async get(ref: string) {
    return this.values.get(ref) ?? null;
  }
  async set(ref: string, value: string) {
    this.values.set(ref, value);
  }
  async delete(ref: string) {
    this.values.delete(ref);
  }
}

/** The keychain on a production desktop install; the encrypted file when headless and in development. */
export function defaultSecretStoreKind(opts: { env: string; headless: boolean }): SecretStoreKind {
  return opts.env === 'production' && !opts.headless ? 'keychain' : 'file';
}

export function createSecretStore(kind: SecretStoreKind, dataDir: string): SecretStore {
  return kind === 'keychain' ? new KeychainSecretStore() : new FileSecretStore(dataDir);
}
