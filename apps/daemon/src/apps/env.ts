// An app's settings (US-STORE-10): the manifest's env prompts, filled from what the install sheet sent, their defaults
// and generated secrets. Anything wrong is APP_ENV_INVALID with the key and why, which the sheet shows on that field.
import { hlabsError } from '@hlabs/api';
import type { AppManifest } from '@hlabs/app-manifest';
import { randomBytes } from 'node:crypto';

type Prompt = AppManifest['env'][number];

/** A prompt must be filled in: `required: true`, or a visible, non-generated one without a default. */
export function isRequired(p: Prompt): boolean {
  if (p.required !== undefined) return p.required;
  return p.default === undefined && !p.hidden && !p.generate && p.type !== 'boolean';
}

/** Secrets are kept out of SQLite (07 §7.7): generated ones and `secret` prompts live only in the app's .env. */
export const isSecret = (p: Prompt) => p.type === 'secret' || p.generate === true;

const invalid = (key: string, reason: 'required' | 'number' | 'boolean' | 'option' | 'unknown') =>
  hlabsError('APP_ENV_INVALID', `${key}: ${reason}`, { key, reason });

/**
 * Every prompt's value. `existing` (a retry, or a reinstall that kept its data) keeps generated secrets as they were.
 */
export function resolveEnv(
  manifest: AppManifest,
  input: Record<string, string>,
  existing: Record<string, string> = {},
): Record<string, string> {
  const prompts = new Map(manifest.env.map((p) => [p.key, p]));
  for (const key of Object.keys(input)) if (!prompts.has(key)) throw invalid(key, 'unknown');
  const out: Record<string, string> = {};
  for (const p of manifest.env) {
    if (p.generate) {
      out[p.key] = existing[p.key] || randomBytes(32).toString('base64url');
      continue;
    }
    const given = input[p.key] ?? existing[p.key];
    const value = (given ?? (p.default !== undefined ? String(p.default) : p.type === 'boolean' ? 'false' : '')).trim();
    if (value === '') {
      if (isRequired(p)) throw invalid(p.key, 'required');
    } else if (p.type === 'number' && !Number.isFinite(Number(value))) {
      throw invalid(p.key, 'number');
    } else if (p.type === 'boolean' && value !== 'true' && value !== 'false') {
      throw invalid(p.key, 'boolean');
    } else if (p.type === 'select' && !p.options?.includes(value)) {
      throw invalid(p.key, 'option');
    }
    out[p.key] = value;
  }
  return out;
}

/** Reads a project .env written by serializeEnvFile (`KEY='value'`, with `'\''` for quotes). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)='(.*)'$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/'\\''/g, "'");
  }
  return out;
}
