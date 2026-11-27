// Signing a source's index.json (06 §Store index, US-STORE-28): ed25519 in minisign's file format, the same format as
// hlabs's own release signatures (US-SYS-23), so `minisign -V` can check a library too. The public key is minisign's
// `.pub` text; the signature `index.json.sig` is minisign's `.minisig` text, ed25519 over the BLAKE2b-512 of the file
// ("ED", prehashed) plus a global signature over that signature and its trusted comment. Node only.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface LibraryKey {
  /** minisign public key file text: the comment line and base64("Ed" ‖ key id ‖ 32-byte key). */
  publicKey: string;
  /** The private key as PKCS#8 PEM, for the keychain only (07 §7.7). */
  secretKey: string;
  /** What people compare: the key id, grouped ("B70D 7998 32CB 6AD2"). */
  fingerprint: string;
}

/** The key id as minisign prints it: its 8 bytes little-endian, in hex. */
const keyIdHex = (id: Buffer) => Buffer.from(id).reverse().toString('hex').toUpperCase();
const group = (hex: string) => hex.match(/.{4}/g)!.join(' ');

function decodeLine(text: string, line: number): Buffer | null {
  const value = text.split('\n')[line]?.trim();
  if (!value) return null;
  const buf = Buffer.from(value, 'base64');
  return buf.length ? buf : null;
}

/** The public key's id and ed25519 key, or null when it isn't a minisign public key. */
function parsePublicKey(publicKey: string): { id: Buffer; key: ReturnType<typeof createPublicKey> } | null {
  const raw = decodeLine(publicKey.trim(), 1);
  if (!raw || raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') return null;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw.subarray(10)]), format: 'der', type: 'spki' });
    return { id: raw.subarray(2, 10), key };
  } catch {
    return null;
  }
}

/** "B70D 7998 32CB 6AD2" for a minisign public key, or null when it isn't one. */
export function keyFingerprint(publicKey: string): string | null {
  const parsed = parsePublicKey(publicKey);
  return parsed ? group(keyIdHex(parsed.id)) : null;
}

/** A new key pair (`hlabs library keygen`). */
export function generateLibraryKey(): LibraryKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(SPKI_PREFIX.length);
  const id = randomBytes(8);
  const hex = keyIdHex(id);
  return {
    publicKey: `untrusted comment: minisign public key ${hex}\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`,
    secretKey: privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
    fingerprint: group(hex),
  };
}

/** `index.json.sig` for `data` (`hlabs library sign`). */
export function signIndex(data: Buffer, key: { secretKey: string; publicKey: string }, now = Date.now()): string {
  const parsed = parsePublicKey(key.publicKey);
  if (!parsed) throw new Error('Not a library public key');
  const secret = createPrivateKey(key.secretKey);
  const digest = createHash('blake2b512').update(data).digest();
  const sig = sign(null, digest, secret);
  const trusted = `timestamp:${Math.floor(now / 1000)}\tfile:index.json\thashed`;
  const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), secret);
  return [
    `untrusted comment: signature from hlabs library key ${keyIdHex(parsed.id)}`,
    Buffer.concat([Buffer.from('ED'), parsed.id, sig]).toString('base64'),
    `trusted comment: ${trusted}`,
    global.toString('base64'),
    '',
  ].join('\n');
}

/** Whether `signature` (minisign text) signs `data` with `publicKey`. Anything malformed is simply "no". */
export function verifyIndex(data: Buffer, signature: string, publicKey: string): boolean {
  try {
    const pub = parsePublicKey(publicKey);
    if (!pub) return false;
    const lines = signature.trim().split('\n');
    const sig = decodeLine(signature.trim(), 1);
    const trusted = lines[2]?.startsWith('trusted comment: ') ? lines[2].slice('trusted comment: '.length) : null;
    const global = decodeLine(signature.trim(), 3);
    if (!sig || sig.length !== 74 || trusted === null || !global || global.length !== 64) return false;
    if (!sig.subarray(2, 10).equals(pub.id)) return false;
    const alg = sig.subarray(0, 2).toString('latin1');
    const message = alg === 'ED' ? createHash('blake2b512').update(data).digest() : alg === 'Ed' ? data : null;
    if (!message) return false;
    const signed = sig.subarray(10);
    return (
      verify(null, message, pub.key, signed) &&
      verify(null, Buffer.concat([signed, Buffer.from(trusted)]), pub.key, global)
    );
  } catch {
    return false;
  }
}
