// US-ACCT-23 · Preview the invite page (server side): looking at it, any number of times, doesn't use it up.
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-23', () => {
  it('after several previews the real invitee can still join', async () => {
    const d = await daemonWithAdmin(closers);
    const { url } = (await d.mutate('invites.create', { role: 'member' })).result!.data as { url: string };
    const token = url.split('/invite/')[1]!;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${d.url}/trpc/invites.inspect?input=${encodeURIComponent(JSON.stringify({ token }))}`);
      expect(((await res.json()) as { result: { data: { status: string } } }).result.data.status).toBe('valid');
    }
    const joined = await fetch(`${d.url}/trpc/invites.accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, displayName: 'Anu', username: 'anu', password: 'correct horse battery' }),
    });
    expect(((await joined.json()) as { result?: { data: unknown } }).result?.data).toEqual({ redirectTo: '/' });
  });
});
