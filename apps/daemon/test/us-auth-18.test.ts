// US-AUTH-18 · Return to the app I was opening after login (server side).
import { apps, setSetting } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-AUTH-18', () => {
  it('logging in (with or without two-factor) returns to an installed app, and ignores unknown sites', async () => {
    const d = await daemonWithAdmin(closers);
    const db = d.services!.db;
    db.insert(apps)
      .values({
        id: 'immich',
        version: '1.0.0',
        state: 'running',
        hostname: 'immich',
        portFallback: 12001,
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    setSetting(db, 'remote', { state: 'connected', tailnetName: 'tail1234' });
    const login = (next: string) =>
      d.services!.login.login({
        username: 'hari',
        password: 'correct horse battery',
        remember: false,
        next,
        ip: '1.2.3.4',
        userAgent: null,
      });

    expect(await login('https://immich.hlabs.local/photos')).toMatchObject({
      kind: 'ok',
      redirectTo: 'https://immich.hlabs.local/photos',
    });
    expect(await login('https://hlabs.tail1234.ts.net:14001/photos')).toMatchObject({
      redirectTo: 'https://hlabs.tail1234.ts.net:14001/photos',
    });
    expect(await login('/files')).toMatchObject({ redirectTo: '/files' });
    expect(await login('https://evil.com/')).toMatchObject({ redirectTo: '/' });
    expect(await login('http://immich.hlabs.local/')).toMatchObject({ redirectTo: '/' });

    // With two-factor, the code step applies it.
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
    const step = await login('https://immich.hlabs.local/photos');
    if (step.kind !== 'totp') throw new Error('expected a challenge');
    const done = await d.services!.login.verifyTotp({
      challengeId: step.challengeId,
      code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }),
      ip: '1.2.3.4',
      userAgent: null,
    });
    expect(done.redirectTo).toBe('https://immich.hlabs.local/photos');
  });

  it('already signed in on the way to an app on home.arpa: the cookie is set for .<host>.home.arpa, and only allowed addresses come back (D-105)', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.insert(apps)
      .values({
        id: 'immich',
        version: '1',
        state: 'running',
        hostname: 'immich',
        portFallback: 12001,
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    const go = (next: string) =>
      fetch(`${d.url}/trpc/auth.continue`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: d.cookie,
          'x-hlabs-csrf': d.csrf,
          'x-forwarded-host': 'hlabs.home.arpa',
        },
        body: JSON.stringify({ next }),
      });
    const res = await go('https://immich.hlabs.home.arpa/photos');
    expect(((await res.json()) as { result: { data: unknown } }).result.data).toEqual({
      redirectTo: 'https://immich.hlabs.home.arpa/photos',
    });
    expect(res.headers.get('set-cookie')).toMatch(/Domain=\.hlabs\.home\.arpa/);
    const evil = (await (await go('https://evil.example/')).json()) as { result: { data: unknown } };
    expect(evil.result.data).toEqual({ redirectTo: '/' });
  });
});
