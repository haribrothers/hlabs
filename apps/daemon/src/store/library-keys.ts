// The key `hlabs library keygen` makes and `hlabs library sign` signs with (US-STORE-28): ed25519, kept in the
// keychain (or the encrypted file on a headless server, 07 §7.7) as `library-signing-key`. Only its public half and
// signatures ever leave the daemon, and only to the local `hlabs` command (the tray token).
import { hlabsError } from '@hlabs/api';
import { generateLibraryKey, keyFingerprint, signIndex } from '@hlabs/app-manifest/node';
import { z } from 'zod';
import type { SecretStore } from '../platform/secrets';

export const LIBRARY_KEY_REF = 'library-signing-key';
const stored = z.object({ publicKey: z.string(), secretKey: z.string() });

async function read(secrets: SecretStore) {
  const raw = await secrets.get(LIBRARY_KEY_REF);
  if (!raw) return null;
  const parsed = stored.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function libraryKeygen(secrets: SecretStore, replace: boolean) {
  const existing = await read(secrets);
  if (existing && !replace) {
    return { publicKey: existing.publicKey, fingerprint: keyFingerprint(existing.publicKey)!, existed: true };
  }
  const key = generateLibraryKey();
  await secrets.set(LIBRARY_KEY_REF, JSON.stringify({ publicKey: key.publicKey, secretKey: key.secretKey }));
  return { publicKey: key.publicKey, fingerprint: key.fingerprint, existed: false };
}

export async function librarySign(secrets: SecretStore, dataB64: string) {
  const key = await read(secrets);
  if (!key) throw hlabsError('LIBRARY_KEY_MISSING');
  const data = Buffer.from(dataB64, 'base64');
  if (data.length > 1_000_000) throw hlabsError('VALIDATION_FAILED', 'index.json is over 1 MB');
  return { publicKey: key.publicKey, fingerprint: keyFingerprint(key.publicKey)!, signature: signIndex(data, key) };
}
