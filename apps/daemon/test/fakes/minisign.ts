// Minisign signatures as the Tauri updater makes them, for tests (the release key is never in the repo).
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64');

export function testSigner() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const keyId = randomBytes(8);
  const publicKeyB64 = b64(
    `untrusted comment: minisign public key\n${b64(Buffer.concat([Buffer.from('Ed'), keyId, raw]))}\n`,
  );
  return {
    publicKey: publicKeyB64,
    /** A Tauri-style signature (base64 of the .sig file) of `data`. */
    sign(data: Buffer): string {
      const sig = sign(null, createHash('blake2b512').update(data).digest(), privateKey);
      const comment = 'timestamp:1\tfile:hlabsd.tar.gz';
      const global = sign(null, Buffer.concat([sig, Buffer.from(comment)]), privateKey);
      const file = [
        'untrusted comment: signature from tauri secret key',
        b64(Buffer.concat([Buffer.from('ED'), keyId, sig])),
        `trusted comment: ${comment}`,
        b64(global),
        '',
      ].join('\n');
      return b64(file);
    },
  };
}
