// The tray's local token (US-INST-15, 07 §7.5, D-035, D-112). The tray creates 32 random bytes (base64url) and keeps
// them in the keychain (`dev.hlabs` / `tray-token`), or in `<dataDir>/tray.token` where there is no keychain. The
// daemon keeps only the SHA-256 and accepts the token as `Authorization: Bearer` from loopback, never through Caddy.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DaemonConfig } from '../config';
import { KeychainSecretStore } from '../platform/secrets';

/** Keychain account of the tray token (service `dev.hlabs`, D-050). */
export const TRAY_TOKEN_ACCOUNT = 'tray-token';
/** The token file where there is no keychain (D-035, D-112). */
export const TRAY_TOKEN_FILE = 'tray.token';

/** Where the tray token is read from. */
export interface TrayTokenSource {
  read(): Promise<string | null>;
}

export class KeychainTrayTokenSource implements TrayTokenSource {
  constructor(private readonly keychain = new KeychainSecretStore()) {}
  async read() {
    return this.keychain.get(TRAY_TOKEN_ACCOUNT);
  }
}

export class FileTrayTokenSource implements TrayTokenSource {
  constructor(readonly path: string) {}
  async read() {
    if (!existsSync(this.path)) return null;
    const token = readFileSync(this.path, 'utf8').trim();
    return token === '' ? null : token;
  }
}

/** A new token: 32 random bytes, base64url. */
export function newTrayToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Headless Linux has no tray to create the token, so the daemon does: `/var/lib/hlabs/tray.token`, mode 0640 (the
 * install script gives it the `hlabs` group, D-035). Never replaces an existing token.
 */
export function ensureTrayTokenFile(path: string): void {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${newTrayToken()}\n`, { mode: 0o640, flag: 'wx' });
}

/** The first source that has a token; one that fails counts as having none. */
export class FirstTrayTokenSource implements TrayTokenSource {
  constructor(readonly sources: readonly TrayTokenSource[]) {}
  async read() {
    for (const source of this.sources) {
      const token = await source.read().catch(() => null);
      if (token) return token;
    }
    return null;
  }
}

export function trayTokenSource(config: DaemonConfig, platform: NodeJS.Platform = process.platform): TrayTokenSource {
  const path = join(config.paths.dataDir, TRAY_TOKEN_FILE);
  if (config.secretStore === 'keychain') {
    // A Linux desktop without Secret Service keeps the token in the 0600 file instead (07 §7.5).
    return platform === 'linux'
      ? new FirstTrayTokenSource([new KeychainTrayTokenSource(), new FileTrayTokenSource(path)])
      : new KeychainTrayTokenSource();
  }
  if (config.headless) ensureTrayTokenFile(path);
  return new FileTrayTokenSource(path);
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** How often a token that doesn't match makes the daemon read the source again (D-112). */
const RELOAD_MS = 5_000;

/**
 * Checks tray tokens against the hash of the stored one. A token that doesn't match makes it read the source again
 * at most every 5 s, so a token the tray just regenerated (US-INST-16) works without a restart.
 */
export class TrayTokens {
  private hash: Buffer | null = null;
  private loadedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly source: TrayTokenSource,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    this.loadedAt = this.now();
    try {
      const token = await this.source.read();
      this.hash = token ? sha256(token) : null;
    } catch {
      // The keychain refused or the file is unreadable: no tray access until it can be read.
      this.hash = null;
    }
  }

  async verify(token: string): Promise<boolean> {
    if (token === '') return false;
    const candidate = sha256(token);
    if (this.matches(candidate)) return true;
    if (this.now() - this.loadedAt < RELOAD_MS) return false;
    await this.load();
    return this.matches(candidate);
  }

  private matches(candidate: Buffer): boolean {
    return this.hash !== null && timingSafeEqual(candidate, this.hash);
  }
}

/** True for 127.0.0.0/8 and ::1 (and their IPv4-mapped form). */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  return v4 === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

/** The Bearer value of an Authorization header, or null when there is none. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.*)$/i.exec(header);
  return match ? match[1]!.trim() : null;
}
