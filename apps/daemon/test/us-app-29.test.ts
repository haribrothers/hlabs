// US-APP-29 · See who visits a public app: the last 7 days of requests to its public address from Caddy's access log
// (time, address and country from Cloudflare, path, result), newest first, filtered by result, a page at a time; more
// than 20 failed sign-ins from one address in 10 minutes refuse it for an hour and warn the admins; members never see
// Visits. The log is the public listener's own, kept 7 days, outside the proxy log and diagnostics.
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaddyConfig } from '../src/caddy/config';
import type { NoopProxyManager } from '../src/caddy/index';
import { PUBLIC_FAILURE_LIMIT, PUBLIC_REFUSE_MS, SignInLimiter } from '../src/public/limiter';
import { appendAccessLine, readVisits, visitResult, VISITS_KEEP_MS } from '../src/public/visits';
import { tempDir } from './helpers';
import { memberSession } from './member-session';
import { HOST, pageData, PASSWORD, publicFixture } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Visits = {
  items: Array<{ at: number; ip: string; country: string | null; path: string; result: string }>;
  nextCursor: string | null;
  refused: Array<{ ip: string; until: number; failures: number }>;
};

const line = (o: {
  at: number;
  host?: string;
  path?: string;
  method?: string;
  status?: number;
  ip?: string;
  country?: string;
  location?: string;
}) => ({
  ts: o.at / 1000,
  status: o.status ?? 200,
  request: {
    host: o.host ?? HOST,
    method: o.method ?? 'GET',
    uri: o.path ?? '/',
    client_ip: o.ip ?? '198.51.100.7',
    headers: o.country ? { 'Cf-Ipcountry': [o.country] } : {},
  },
  resp_headers: o.location ? { Location: [o.location] } : {},
});

describe('US-APP-29', () => {
  it('says what each request came to: signed in, asked to sign in, refused, too many tries', () => {
    const r = (o: Parameters<typeof line>[0]) => visitResult(line(o));
    expect(r({ at: 0, path: '/photos' })).toBe('signedIn');
    expect(r({ at: 0, status: 302, location: '/.hlabs/sign-in?next=%2F' })).toBe('askedToSignIn');
    expect(r({ at: 0, status: 401 })).toBe('askedToSignIn');
    expect(r({ at: 0, path: '/.hlabs/sign-in?next=/' })).toBe('askedToSignIn');
    expect(r({ at: 0, method: 'POST', path: '/.hlabs/sign-in', status: 200 })).toBe('askedToSignIn');
    expect(r({ at: 0, method: 'POST', path: '/.hlabs/sign-in', status: 303 })).toBe('signedIn');
    expect(r({ at: 0, method: 'POST', path: '/.hlabs/sign-in', status: 401 })).toBe('refused');
    expect(r({ at: 0, status: 403 })).toBe('refused');
    expect(r({ at: 0, method: 'POST', path: '/.hlabs/sign-in', status: 429 })).toBe('tooManyTries');
    // The app's own redirects are the app's.
    expect(r({ at: 0, status: 302, location: '/login' })).toBe('signedIn');
  });

  it('lists the last 7 days to that address, newest first, with country, by result, a page at a time', () => {
    const dir = tempDir();
    const now = Date.now();
    appendAccessLine(dir, line({ at: now - VISITS_KEEP_MS - 60_000, path: '/too-old' }));
    for (let i = 0; i < 5; i++)
      appendAccessLine(dir, line({ at: now - 50_000 + i * 1000, path: `/p${i}`, country: 'in' }));
    appendAccessLine(dir, line({ at: now - 10_000, host: 'other.example.com', path: '/other' }));
    appendAccessLine(dir, line({ at: now - 5_000, status: 403, path: '/admin', ip: '203.0.113.24' }));
    // Two at the very same moment, split across pages.
    appendAccessLine(dir, line({ at: now - 2_000, path: '/same-a' }));
    appendAccessLine(dir, line({ at: now - 2_000, path: '/same-b' }));

    const all = readVisits(dir, HOST, { now, limit: 100 }).items;
    expect(all.map((v) => v.path)).toEqual(['/same-b', '/same-a', '/admin', '/p4', '/p3', '/p2', '/p1', '/p0']);
    expect(all[3]).toMatchObject({ ip: '198.51.100.7', country: 'IN', result: 'signedIn', method: 'GET', status: 200 });
    expect(readVisits(dir, HOST, { now, limit: 100, result: 'refused' }).items.map((v) => v.path)).toEqual(['/admin']);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < 10; pages++) {
      const page = readVisits(dir, HOST, { now, limit: 1, cursor });
      seen.push(...page.items.map((v) => v.path));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(all.map((v) => v.path));
  });

  it("apps.publicVisits reads the public listener's log for that app, and names the addresses refused now", async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const visit = (body: Record<string, unknown>) =>
      fetch(`${t.d.url}/dev/public-visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    await visit({ host: HOST, path: '/photos', ip: '198.51.100.7', country: 'IN', at: Date.now() - 60_000 });
    await visit({ host: HOST, path: '/.hlabs/sign-in', method: 'POST', status: 401, count: 3 });
    const page = (await t.d.query('apps.publicVisits', { appId: 'vaultwarden' })).result!.data as unknown as Visits;
    expect(page.items).toHaveLength(4);
    expect(page.items.map((v) => v.result)).toEqual(['refused', 'refused', 'refused', 'signedIn']);
    expect(page.items[3]).toMatchObject({ path: '/photos', ip: '198.51.100.7', country: 'IN' });
    const refusedOnly = (await t.d.query('apps.publicVisits', { appId: 'vaultwarden', result: 'refused' })).result!
      .data as unknown as Visits;
    expect(refusedOnly.items).toHaveLength(3);
    expect(page.refused).toEqual([]);
  });

  it('more than 20 failed sign-ins from one address in 10 minutes refuse it for an hour and warn the admins', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const attacker = '203.0.113.24';
    const statuses: number[] = [];
    for (let i = 0; i < PUBLIC_FAILURE_LIMIT + 1; i++) {
      const res = await t.page('POST', '/.hlabs/sign-in', {
        ip: attacker,
        form: { username: i % 2 ? 'hari' : `guess${i}`, password: 'wrong' },
      });
      statuses.push(res.status);
      if (i === PUBLIC_FAILURE_LIMIT) expect(pageData(await res.text())).toMatchObject({ step: 'tooManyTries' });
    }
    // Wrong passwords (and hlabs's own lockout for @hari after 5) until the 21st, which refuses the address.
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, PUBLIC_FAILURE_LIMIT).every((s) => s === 401 || s === 429)).toBe(true);
    // Refused now: even the right password isn't checked from there.
    const right = await t.page('POST', '/.hlabs/sign-in', {
      ip: attacker,
      form: { username: 'hari', password: PASSWORD },
    });
    expect(right.status).toBe(429);
    expect((await t.page('GET', '/.hlabs/sign-in', { ip: attacker })).status).toBe(429);
    // Someone else, elsewhere, still signs in.
    expect((await t.signIn({ ip: '198.51.100.7' })).cookie).toBeTruthy();

    expect(t.notes('app.public_attack')).toEqual([
      expect.objectContaining({
        userId: null,
        severity: 'warning',
        target: 'vaultwarden',
        title: 'Someone keeps trying to sign in to Vaultwarden',
        body: `21 failed sign-ins from ${attacker} in 10 minutes. That address is refused for an hour.`,
      }),
    ]);
    expect(t.audits('public.signIn.refused')).toEqual([
      expect.objectContaining({ ip: attacker, target: 'vaultwarden', detailJson: { ip: attacker, failures: 21 } }),
    ]);
    const visits = (await t.d.query('apps.publicVisits', { appId: 'vaultwarden' })).result!.data as unknown as Visits;
    expect(visits.refused).toEqual([{ ip: attacker, until: expect.any(Number), failures: 21 }]);
  });

  it("an address is let in again after the hour, and failures older than 10 minutes don't count", () => {
    const limiter = new SignInLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < PUBLIC_FAILURE_LIMIT; i++) limiter.fail('a', 'app', t0 + i);
    expect(limiter.refusedUntil('a', t0 + 100)).toBeNull();
    // Eleven minutes on, the old twenty no longer count.
    expect(limiter.fail('a', 'app', t0 + 11 * 60_000).refused).toBeNull();
    for (let i = 0; i < PUBLIC_FAILURE_LIMIT; i++) limiter.fail('b', 'app', t0 + i);
    const { refused } = limiter.fail('b', 'app', t0 + 30);
    expect(refused).toMatchObject({ ip: 'b', until: t0 + 30 + PUBLIC_REFUSE_MS, failures: 21 });
    expect(limiter.refusedUntil('b', t0 + 60_000)).toBe(t0 + 30 + PUBLIC_REFUSE_MS);
    expect(limiter.refusedUntil('b', t0 + 30 + PUBLIC_REFUSE_MS)).toBeNull();
  });

  it('members never see Visits', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const anu = await memberSession(t.d, { appIds: ['vaultwarden'] });
    expect((await anu.query('apps.publicVisits', { appId: 'vaultwarden' })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
    expect(() => t.s.publicApps.visits({ userId: anu.userId, role: 'member' }, { appId: 'vaultwarden' })).toThrow();
  });

  it("Caddy writes the public listener's log on its own, kept 7 days, never in the proxy log", async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const config = buildCaddyConfig((t.s.proxy as NoopProxyManager).last!, {
      storageDir: '/c',
      adminSocket: '/c/a.sock',
      logFile: '/c/caddy.log',
      webFallbackDir: '/f',
    }) as unknown as { logging: { logs: Record<string, Record<string, unknown>> } };
    expect(config.logging.logs.public).toMatchObject({
      writer: { filename: `${t.d.config.paths.dataDir}/logs/public/access.log`, roll_keep_days: 7 },
      encoder: { format: 'json' },
      include: ['http.log.access.public'],
    });
    expect(config.logging.logs.default).toMatchObject({ exclude: ['http.log.access.public'] });
  });
});
