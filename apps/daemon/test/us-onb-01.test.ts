// US-ONB-01 · Open onboarding automatically on first run (phase 1 criteria: printed setup URL, setup token).
import { getSetting } from '@hlabs/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSecretStore } from '../src/platform/secrets';
import { SETUP_TOKEN_REF } from '../src/onboarding/service';
import { startDaemon, testConfig } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function start(config = testConfig()) {
  const printed: string[] = [];
  const daemon = await startDaemon({ config, boot: { print: (line) => printed.push(line) } });
  closers.push(daemon.close);
  return { ...daemon, printed };
}

const SETUP_URL = /^http:\/\/127\.0\.0\.1:5173\/setup\?token=([A-Za-z0-9_-]{43})$/;

function setupUrlIn(lines: string[]): string {
  const match = lines.join('\n').match(/open (\S+)/);
  expect(match).not.toBeNull();
  return match![1]!;
}

async function trpc(url: string, path: string, opts: { input?: unknown; token?: string; mutation?: boolean } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token !== undefined) headers['x-hlabs-setup'] = opts.token;
  const res = opts.mutation
    ? await fetch(`${url}/trpc/${path}`, { method: 'POST', headers, body: JSON.stringify(opts.input ?? null) })
    : await fetch(`${url}/trpc/${path}`, { headers });
  return (await res.json()) as { result?: { data: unknown }; error?: { data: { hlabsCode: string } } };
}

describe('US-ONB-01', () => {
  it('prints the setup URL with a 32-byte token when the daemon starts with no users', async () => {
    const { printed } = await start();
    expect(setupUrlIn(printed)).toMatch(SETUP_URL);
  });

  it('reports onboarding status publicly, without user data', async () => {
    const { url } = await start();
    const res = await trpc(url, 'onboarding.status');
    expect(res.result?.data).toEqual({ completed: false, step: 'welcome', hasUsers: false });
  });

  it('refuses setup procedures without the setup token, even for a signed-in caller', async () => {
    // testConfig turns on HLABS_DEV_ANONYMOUS_ADMIN, so the caller is an admin: the token is still required.
    const { url } = await start();
    const res = await trpc(url, 'onboarding.setStep', { mutation: true, input: { step: 'system' } });
    expect(res.error?.data.hlabsCode).toBe('ONBOARDING_SETUP_TOKEN_REQUIRED');
    const wrong = await trpc(url, 'onboarding.setStep', { mutation: true, input: { step: 'system' }, token: 'nope' });
    expect(wrong.error?.data.hlabsCode).toBe('ONBOARDING_SETUP_TOKEN_REQUIRED');
  });

  it('accepts the token from the setup URL, from any number of tabs', async () => {
    const { url, printed } = await start();
    const token = setupUrlIn(printed).match(SETUP_URL)![1]!;
    for (let tab = 0; tab < 2; tab++) {
      const res = await trpc(url, 'onboarding.setStep', { mutation: true, input: { step: 'system' }, token });
      // Past the token check; the step itself is built by a later story.
      expect(res.error?.data.hlabsCode).toBe('NOT_IMPLEMENTED');
    }
  });

  it('hands out the same token after a restart, read from the secret store', async () => {
    const config = testConfig();
    const first = await start(config);
    const firstUrl = setupUrlIn(first.printed);
    await first.close();
    closers.splice(closers.indexOf(first.close), 1);

    const second = await start(config);
    expect(setupUrlIn(second.printed)).toBe(firstUrl);
    const res = await fetch(`${second.url}/dev/setup-url`);
    expect(await res.json()).toEqual({ url: firstUrl });
  });

  it('keeps only a reference in SQLite; the token itself is in the secret store', async () => {
    const config = testConfig();
    const { services, printed } = await start(config);
    const token = setupUrlIn(printed).match(SETUP_URL)![1]!;
    expect(getSetting(services!.db, 'onboarding').setupTokenRef).toBe(SETUP_TOKEN_REF);
    expect(await new FileSecretStore(config.paths.dataDir).get(SETUP_TOKEN_REF)).toBe(token);
    services!.db.$client.pragma('wal_checkpoint(TRUNCATE)');
    expect(readFileSync(join(config.paths.dataDir, 'hlabs.db')).includes(token)).toBe(false);
  });

  it('rejects the token once onboarding is complete, deletes it, and prints nothing on the next start', async () => {
    const config = testConfig();
    const first = await start(config);
    const token = setupUrlIn(first.printed).match(SETUP_URL)![1]!;
    await fetch(`${first.url}/dev/complete-onboarding`, { method: 'POST' });

    const reused = await trpc(first.url, 'onboarding.setStep', { mutation: true, input: { step: 'system' }, token });
    expect(reused.error?.data.hlabsCode).toBe('ONBOARDING_COMPLETE');
    expect(await new FileSecretStore(config.paths.dataDir).get(SETUP_TOKEN_REF)).toBeNull();
    expect((await trpc(first.url, 'onboarding.status')).result?.data).toMatchObject({ completed: true, step: 'done' });
    await first.close();
    closers.splice(closers.indexOf(first.close), 1);

    const second = await start(config);
    expect(second.printed).toEqual([]);
    expect(await (await fetch(`${second.url}/dev/setup-url`)).json()).toEqual({ url: null });
  });
});
