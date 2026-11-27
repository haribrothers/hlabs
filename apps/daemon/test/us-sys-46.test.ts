// US-SYS-46 · Sign in to the public dashboard (D-182, 07 §7.11 controls 2–4, 6): no list of users and no "Remember
// me"; the two-factor code always (no two-factor, no session: AUTH_TWO_FACTOR_REQUIRED); a session for that address
// only (a home session doesn't work there, nor the other way round) that ends 12 hours after it began however active;
// listed as the public dashboard's; a sign-in from a new place tells the person; the lockout and the public limit per
// address; setup, invites and reset links never served there; `auth.me.via`.
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_DASHBOARD_SESSION_MS } from '../src/auth/sessions';
import { countryName } from '../src/auth/new-place';
import { anonymousAdmin } from '../src/http/via';
import { DASH, DASH_ORIGIN, publicDashboardFixture } from './public-dashboard-fixture';
import { PASSWORD } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-SYS-46', () => {
  it('never lists who uses hlabs there, whatever the people policy says', async () => {
    const t = await publicDashboardFixture(closers);
    expect(((await t.d.query('auth.listLoginUsers')).result!.data as { users: unknown[] }).users).not.toEqual([]);
    // The sign-in page knows where it was opened from before anyone signs in (D-185).
    expect((await t.d.query('auth.listLoginUsers')).result!.data).toMatchObject({ via: 'home' });
    expect((await t.pubQuery('auth.listLoginUsers')).result!.data).toEqual({ users: [], via: 'public' });
  });

  it('always asks for the two-factor code, and the session belongs to the public address only', async () => {
    const t = await publicDashboardFixture(closers);
    const { first, second, cookie } = await t.signInPublic();
    expect(first.result!.data).toMatchObject({ status: 'totp_required' });
    expect(second!.result!.data).toEqual({ redirectTo: '/' });
    // Host-only (no Domain), and no "Remember me" even when asked: it ends with the browser.
    expect(second!.setCookie).not.toMatch(/Domain=/);
    expect(second!.setCookie).not.toMatch(/Max-Age=/);
    const row = t.sessionRows().find((s) => s.publicHost === DASH)!;
    expect(row).toMatchObject({ remember: false, publicHost: DASH });
    expect(row.expiresAt - row.createdAt).toBe(PUBLIC_DASHBOARD_SESSION_MS);
    const me = await t.pubQuery('auth.me', undefined, { cookie });
    expect(me.result!.data).toMatchObject({ username: 'hari', via: 'public', remember: false });
    // The same cookie at home or on the tailnet: refused.
    expect((await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie: cookie! } })).status).toBe(401);
    // A home session on the public address: refused.
    expect((await t.pubQuery('auth.me', undefined, { cookie: t.d.cookie })).error?.data.hlabsCode).toBe(
      'AUTH_REQUIRED',
    );
    // A public session on another public name, or claimed without the public listener's mark: refused.
    expect((await t.pubQuery('auth.me', undefined, { cookie, host: 'other.example.com' })).status).toBe(401);
    expect((await t.pubQuery('auth.me', undefined, { cookie, via: null })).status).toBe(401);
    // auth.me says where a request came from.
    expect(((await t.d.query('auth.me')).result!.data as { via: string }).via).toBe('home');
  });

  it('someone without two-factor gets AUTH_TWO_FACTOR_REQUIRED, and no session is made', async () => {
    const t = await publicDashboardFixture(closers);
    await t.person({ username: 'ravi', totp: false });
    const before = t.sessionRows().length;
    const reply = await t.pubMutate('auth.login', { username: 'ravi', password: PASSWORD });
    expect(reply.error?.data.hlabsCode).toBe('AUTH_TWO_FACTOR_REQUIRED');
    expect(reply.setCookie).toBeNull();
    expect(t.sessionRows().length).toBe(before);
  });

  it('recovery codes work there too', async () => {
    const t = await publicDashboardFixture(closers);
    const codes = (await t.d.mutate('account.recoveryCodes.regenerate', { password: PASSWORD })).result!.data as {
      recoveryCodes: string[];
    };
    const first = await t.pubMutate('auth.login', { username: 'hari', password: PASSWORD });
    const used = await t.pubMutate('auth.useRecoveryCode', {
      challengeId: first.result!.data.challengeId,
      code: codes.recoveryCodes[0],
    });
    expect(used.result!.data).toMatchObject({ redirectTo: '/' });
    expect(t.sessionRows().filter((s) => s.publicHost === DASH)).toHaveLength(1);
  });

  it('a code step started at home never finishes on the public address, nor the other way round', async () => {
    const t = await publicDashboardFixture(closers);
    const home = await fetch(`${t.d.url}/trpc/auth.login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hari', password: PASSWORD }),
    });
    const challengeId = ((await home.json()) as { result: { data: { challengeId: string } } }).result.data.challengeId;
    const reply = await t.pubMutate('auth.verifyTotp', { challengeId, code: t.code() });
    expect(reply.error?.data.hlabsCode).toBe('AUTH_CHALLENGE_EXPIRED');
  });

  it('ends 12 hours after it began, however active, and is listed as the public dashboard', async () => {
    const t = await publicDashboardFixture(closers);
    const { cookie } = await t.signInPublic();
    const items = (await t.d.query('auth.listSessions')).result!.data as {
      items: Array<{ publicHost: string | null; publicDashboard: boolean }>;
    };
    expect(items.items.find((s) => s.publicHost === DASH)).toMatchObject({ publicDashboard: true });
    const row = t.sessionRows().find((s) => s.publicHost === DASH)!;
    // Active all along: each request more than a minute after the last would slide a home session's end.
    const base = row.createdAt;
    for (const hours of [2, 6, 11.5]) {
      const now = base + hours * 3_600_000;
      expect(
        t.s.sessions.resolve(cookie!.split('=')[1], now, { publicHost: DASH, absolute: true }),
        `${hours}h`,
      ).not.toBeNull();
    }
    expect(t.sessionRows().find((s) => s.id === row.id)!.expiresAt).toBe(row.expiresAt);
    expect(
      t.s.sessions.resolve(cookie!.split('=')[1], base + PUBLIC_DASHBOARD_SESSION_MS, {
        publicHost: DASH,
        absolute: true,
      }),
    ).toBeNull();
  });

  it('a sign-in from a new place tells the person, with "Sign out everywhere", and records it', async () => {
    const t = await publicDashboardFixture(closers);
    await t.signInPublic({ ip: '198.51.100.20', country: 'NL' });
    expect(t.notes('account.new_sign_in')).toEqual([
      expect.objectContaining({
        userId: t.d.userId,
        severity: 'warning',
        title: `New sign-in to hlabs from ${countryName('NL')} (198.51.100.20)`,
        body: `Someone signed in as you at ${DASH}. Not you? Sign out everywhere.`,
        // "Sign out everywhere" runs from the notification itself (it's on TOAST_MUTATIONS).
        actionJson: [
          { kind: 'mutation', procedure: 'auth.revokeOtherSessions', input: {}, label: 'Sign out everywhere' },
        ],
      }),
    ]);
    expect(t.audits('auth.login.newPlace')).toEqual([
      expect.objectContaining({
        userId: t.d.userId,
        detailJson: { ip: '198.51.100.20', country: 'NL', publicHost: DASH },
      }),
    ]);
    // The same place again within 30 days: nothing new.
    await t.signInPublic({ ip: '198.51.100.20', country: 'NL' });
    expect(t.notes('account.new_sign_in')).toHaveLength(1);
    // Another address: told again.
    await t.signInPublic({ ip: '192.0.2.99', country: 'JP' });
    expect(t.notes('account.new_sign_in')).toHaveLength(2);
  });

  it('"Sign out everywhere" ends every other session, from the public address too', async () => {
    const t = await publicDashboardFixture(closers);
    const a = await t.signInPublic({ ip: '198.51.100.21' });
    const b = await t.signInPublic({ ip: '198.51.100.22' });
    const reply = await t.pubMutate('auth.revokeOtherSessions', undefined, { cookie: b.cookie, csrf: b.csrf });
    expect(reply.result!.data).toEqual({ ended: 2 }); // the home session and the other public one
    expect((await t.pubQuery('auth.me', undefined, { cookie: a.cookie })).status).toBe(401);
    expect((await t.pubQuery('auth.me', undefined, { cookie: b.cookie })).status).toBe(200);
    expect(t.audits('session.revokeOthers')).toEqual([expect.objectContaining({ detailJson: { ended: 2 } })]);
  });

  it('failed sign-ins: the lockout, and more than 20 from one address refuse it for an hour and warn the admins', async () => {
    const t = await publicDashboardFixture(closers);
    const ip = '203.0.113.66';
    // Different usernames, so the per-username lockout (07 §7.2) doesn't stop the count first.
    for (let i = 0; i < 21; i++) {
      const r = await t.pubMutate('auth.login', { username: `nobody${i}`, password: 'wrong password' }, { ip });
      if (i < 20) expect(r.error?.data.hlabsCode, `try ${i}`).toBe('AUTH_INVALID_CREDENTIALS');
      else expect(r.error?.data).toMatchObject({ hlabsCode: 'AUTH_LOCKED', detail: { address: true } });
    }
    // Refused now, even with the right password.
    const right = await t.pubMutate('auth.login', { username: 'hari', password: PASSWORD }, { ip });
    expect(right.error?.data.hlabsCode).toBe('AUTH_LOCKED');
    expect((right.error?.data.detail as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(3000);
    expect(t.notes('dashboard.public_attack')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        title: 'Someone keeps trying to sign in to the hlabs dashboard',
        body: `21 failed sign-ins from ${ip} in 10 minutes. That address is refused for an hour.`,
      }),
    ]);
    // Another address still may.
    expect((await t.pubMutate('auth.login', { username: 'hari', password: PASSWORD })).result).toBeTruthy();
    // At home, the address limit doesn't apply.
    const home = await fetch(`${t.d.url}/trpc/auth.login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ username: 'hari', password: PASSWORD }),
    });
    expect(home.status).toBe(200);
  });

  it('the lockout of 07 §7.2 applies there as at home', async () => {
    const t = await publicDashboardFixture(closers);
    for (let i = 0; i < 4; i++) await t.pubMutate('auth.login', { username: 'hari', password: 'wrong password' });
    const fifth = await t.pubMutate('auth.login', { username: 'hari', password: 'wrong password' });
    expect(fifth.error?.data.hlabsCode).toBe('AUTH_LOCKED');
  });

  it('never serves first-run setup, invites or reset links: HOME_ONLY, recorded', async () => {
    const t = await publicDashboardFixture(closers);
    expect((await t.pubQuery('onboarding.checkSystem')).error?.data.hlabsCode).toBe('HOME_ONLY');
    expect(
      (await t.pubMutate('onboarding.createAdmin', { displayName: 'X', username: 'x', password: PASSWORD })).error?.data
        .hlabsCode,
    ).toBe('HOME_ONLY');
    expect((await t.pubQuery('invites.inspect', { token: 'abc' })).error?.data.hlabsCode).toBe('HOME_ONLY');
    expect(
      (await t.pubMutate('invites.accept', { token: 'abc', displayName: 'X', username: 'xx', password: PASSWORD }))
        .error?.data.hlabsCode,
    ).toBe('HOME_ONLY');
    expect(
      (await t.pubMutate('auth.resetPassword', { token: 'abc', newPassword: PASSWORD })).error?.data.hlabsCode,
    ).toBe('HOME_ONLY');
    expect(t.audits('homeOnly.refused').map((a) => (a.detailJson as { procedure: string }).procedure)).toEqual([
      'onboarding.checkSystem',
      'onboarding.createAdmin',
      'invites.inspect',
      'invites.accept',
      'auth.resetPassword',
    ]);
    // onboarding.status still answers (the dashboard routes by it).
    expect((await t.pubQuery('onboarding.status')).result).toBeTruthy();
  });

  it('files, the wallpaper and other HTTP routes take the public session, and never a home one there', async () => {
    const t = await publicDashboardFixture(closers);
    const { cookie } = await t.signInPublic();
    const headers = (c: string) => ({
      cookie: c,
      'x-hlabs-via': 'public',
      'x-hlabs-public-host': DASH,
      'x-forwarded-for': '203.0.113.7',
    });
    const list = (c: string) =>
      fetch(`${t.d.url}/api/files/download?path=${encodeURIComponent('/')}`, { headers: headers(c) });
    expect((await list(cookie!)).status).not.toBe(401);
    expect((await list(t.d.cookie)).status).toBe(401);
    expect((await fetch(`${t.d.url}/api/appearance/wallpaper`, { headers: headers(t.d.cookie) })).status).toBe(401);
  });

  it('mutations there must come from the public address (CSRF origin)', async () => {
    const t = await publicDashboardFixture(closers);
    const { cookie, csrf } = await t.signInPublic();
    const ok = await t.pubMutate('notifications.markAllRead', undefined, { cookie, csrf });
    expect(ok.status).toBe(200);
    const evil = await t.pubMutate('notifications.markAllRead', undefined, {
      cookie,
      csrf,
      origin: 'https://evil.example',
    });
    expect(evil.error?.data.hlabsCode).toBe('CSRF_REJECTED');
    expect(DASH_ORIGIN).toBe('https://hlabs.example.com');
  });

  it('the development-only anonymous admin never applies to a request from the public dashboard', () => {
    expect(anonymousAdmin(true, { 'x-hlabs-via': 'public' })).toBe(false);
    expect(anonymousAdmin(true, {})).toBe(true);
    expect(anonymousAdmin(false, {})).toBe(false);
  });
});
