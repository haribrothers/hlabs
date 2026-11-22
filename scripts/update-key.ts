// The hlabs update key (D-118, D-141) as the release scripts need it: `tauri signer` signs, and install.sh checks
// with openssl, which wants the Ed25519 key as SPKI.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** The Ed25519 key of a minisign public key file (base64 of it, as `tauri signer` writes) as base64 SPKI DER. */
export function spkiBase64(minisignPublicKeyB64: string): string {
  const line = Buffer.from(minisignPublicKeyB64.trim(), 'base64').toString('utf8').split('\n')[1]?.trim() ?? '';
  const raw = Buffer.from(line, 'base64');
  if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') throw new Error('Not a minisign public key');
  return Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw.subarray(10)]).toString('base64');
}

/** install.sh with the public key written in. */
export function installScript(template: string, minisignPublicKeyB64: string): string {
  return template.replace('@HLABS_PUBLIC_KEY@', spkiBase64(minisignPublicKeyB64));
}

/** `tauri signer` with this environment (TAURI_SIGNING_PRIVATE_KEY and its password). */
export function signer(env: NodeJS.ProcessEnv) {
  return (args: string[]) =>
    execFileSync('pnpm', ['exec', 'tauri', 'signer', ...args], { cwd: join(root, 'apps/tray'), env });
}
