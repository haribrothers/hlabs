// US-ACCT-26 · Access changes apply straight away (server side): /auth/verify follows app_access with no stale answer.
import { apps } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-26', () => {
  it('taking an app away is 403 at once; giving it back is 200 without logging in again; admins ignore app_access', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.insert(apps)
      .values({
        id: 'immich',
        version: '1',
        state: 'running',
        hostname: 'immich',
        portFallback: 12000,
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    const anu = await memberSession(d, { appIds: ['immich'] });
    const verify = async (cookie: string) =>
      (
        await fetch(`${d.url}/auth/verify`, {
          headers: {
            'x-forwarded-host': 'immich.hlabs.local',
            'x-forwarded-uri': '/',
            accept: 'application/json',
            cookie,
          },
        })
      ).status;

    expect(await verify(anu.cookie)).toBe(200);
    // The answer is cached for 10 s, but a change clears it.
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [] });
    expect(await verify(anu.cookie)).toBe(403);
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: ['immich'] });
    expect(await verify(anu.cookie)).toBe(200);
    // An admin with no app_access rows still gets in.
    expect(await verify(d.cookie)).toBe(200);
  });
});
