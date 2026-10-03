// Checking an update's signature (US-SYS-23): minisign signatures as the Tauri updater makes them (`tauri signer
// sign`): the signature and the public key are each the base64 of their minisign file. Ed25519 over the BLAKE2b-512
// of the file ("ED", what Tauri makes) or over the file itself ("Ed"), and a second signature over that signature
// and its trusted comment. Anything malformed, a different key or a changed file is simply "not valid".
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** The second line of a base64-encoded minisign file, decoded. */
function payloadLine(fileB64: string, line: number): Buffer | null {
  const text = Buffer.from(fileB64.trim(), 'base64').toString('utf8');
  const value = text.split('\n')[line]?.trim();
  return value ? Buffer.from(value, 'base64') : null;
}

function publicKey(publicKeyB64: string): { keyId: Buffer; key: KeyObject } | null {
  const raw = payloadLine(publicKeyB64, 1);
  if (!raw || raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') return null;
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  return { keyId: raw.subarray(2, 10), key };
}

/** Whether `signatureB64` is a valid signature of `data` by the key `publicKeyB64`. */
export function verifySignature(data: Buffer, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const pub = publicKey(publicKeyB64);
    if (!pub) return false;
    const lines = Buffer.from(signatureB64.trim(), 'base64').toString('utf8').split('\n');
    const sig = lines[1] ? Buffer.from(lines[1].trim(), 'base64') : null;
    const trusted = lines[2]?.startsWith('trusted comment: ') ? lines[2].slice('trusted comment: '.length) : null;
    const globalSig = lines[3] ? Buffer.from(lines[3].trim(), 'base64') : null;
    if (!sig || sig.length !== 74 || trusted === null || !globalSig || globalSig.length !== 64) return false;
    const alg = sig.subarray(0, 2).toString('latin1');
    if (!sig.subarray(2, 10).equals(pub.keyId)) return false;
    const message = alg === 'ED' ? createHash('blake2b512').update(data).digest() : alg === 'Ed' ? data : null;
    if (!message) return false;
    const signature = sig.subarray(10);
    return (
      verify(null, message, pub.key, signature) &&
      verify(null, Buffer.concat([signature, Buffer.from(trusted, 'utf8')]), pub.key, globalSig)
    );
  } catch {
    return false;
  }
}
