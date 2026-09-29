// US-ONB-10 · Only allow one admin to be created through onboarding.
import { users } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { code: string; hlabsCode: string } } };

async function atAccountStep() {
  const printed: string[] = [];
  const d = await startDaemon({ config: { devAnonymousAdmin: false }, boot: { print: (l) => printed.push(l) } });
  closers.push(d.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  await fetch(`${d.url}/dev/reset-onboarding`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ step: 'account' }),
  });
  const create = async (username: string, headers: Record<string, string> = { 'x-hlabs-setup': token }) => {
    const res = await fetch(`${d.url}/trpc/onboarding.createAdmin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ displayName: 'Admin', username, password: 'correct horse battery' }),
    });
    return { status: res.status, body: (await res.json()) as Reply };
  };
  return { ...d, token, create };
}

describe('US-ONB-10', () => {
  it('refuses a second admin with CONFLICT ONBOARDING_USERS_EXIST and creates nothing', async () => {
    const d = await atAccountStep();
    expect((await d.create('hari')).body.result).toBeDefined();
    // A stale tab with the old setup token and no session.
    const stale = await d.create('mallory');
    expect(stale.status).toBe(409);
    expect(stale.body.error?.data).toMatchObject({ code: 'CONFLICT', hlabsCode: 'ONBOARDING_USERS_EXIST' });
    // And without any credentials at all.
    expect((await d.create('eve', {})).body.error?.data.hlabsCode).toBe('ONBOARDING_USERS_EXIST');
    expect(d.services!.db.select({ username: users.username }).from(users).all()).toEqual([{ username: 'hari' }]);
  });

  it('two createAdmin calls at once: exactly one succeeds', async () => {
    const d = await atAccountStep();
    const results = await Promise.all([d.create('first'), d.create('second')]);
    const codes = results.map((r) => r.body.error?.data.hlabsCode ?? 'ok').sort();
    expect(codes).toEqual(['ONBOARDING_USERS_EXIST', 'ok']);
    expect(d.services!.db.select().from(users).all()).toHaveLength(1);
  });

  it('with no users and no setup token: FORBIDDEN ONBOARDING_SETUP_TOKEN_REQUIRED', async () => {
    const d = await atAccountStep();
    const res = await d.create('hari', {});
    expect(res.status).toBe(403);
    expect(res.body.error?.data.hlabsCode).toBe('ONBOARDING_SETUP_TOKEN_REQUIRED');
    expect(d.services!.db.select().from(users).all()).toEqual([]);
  });
});
