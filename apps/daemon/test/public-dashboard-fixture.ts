// The public dashboard (US-SYS-45…48): the public-apps fixture (Hari, an admin with two-factor, Cloudflare Tunnel set up
// on the fake Cloudflare's example.com), with the dashboard made public at hlabs.example.com, and requests as Caddy's
// public listener passes them on: `X-Hlabs-Via: public`, `X-Hlabs-Public-Host`, the visitor's address and country.
import { auditLog, notifications, sessions } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import type { Reply } from './admin-session';
import { memberSession } from './member-session';
import { PASSWORD, publicFixture } from './public-fixture';

export const DASH = 'hlabs.example.com';
export const DASH_ORIGIN = `https://${DASH}`;

type Fixture = Awaited<ReturnType<typeof publicFixture>>;

export interface Visitor {
  ip?: string;
  country?: string;
  cookie?: string | null;
  csrf?: string | null;
  /** Leave out `X-Hlabs-Via` (a request at home that only says which host). */
  via?: string | null;
  host?: string;
  origin?: string | null;
}

export async function publicDashboardFixture(
  closers: Array<() => Promise<void>>,
  opts: Parameters<typeof publicFixture>[1] & { makePublic?: boolean } = {},
) {
  const t = await publicFixture(closers, opts);

  /** `public.setDashboard` as Hari at home, waiting for its job. */
  const setDashboard = async (input: Record<string, unknown> = { public: true, password: PASSWORD }) => {
    const reply = (await t.d.mutate('public.setDashboard', input)) as Reply;
    const job = reply.result ? await t.s.jobs.settled(reply.result.data.jobId as string) : null;
    return { reply, job };
  };
  if (opts.makePublic !== false && opts.setUp !== false) {
    const { reply, job } = await setDashboard();
    if (job?.state !== 'succeeded') throw new Error(`dashboard not public: ${JSON.stringify(reply.error ?? job)}`);
  }

  const headersFor = (v: Visitor, mutation: boolean) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-forwarded-for': v.ip ?? '203.0.113.7',
      'x-forwarded-host': v.host ?? DASH,
      'x-forwarded-proto': 'https',
      'x-hlabs-public-host': v.host ?? DASH,
    };
    if (v.via !== null) headers['x-hlabs-via'] = v.via ?? 'public';
    if (v.country !== undefined) headers['cf-ipcountry'] = v.country;
    if (v.cookie) headers.cookie = v.cookie;
    if (v.csrf) headers['x-hlabs-csrf'] = v.csrf;
    if (mutation && v.origin !== null) headers.origin = v.origin ?? DASH_ORIGIN;
    return headers;
  };

  /**
   * A code for now, forgetting which step was used last (each code works once, US-AUTH-08), so a test can sign in more
   * than twice in 30 seconds.
   */
  const freshCode = (secret: string) => {
    (t.s.totp as unknown as { lastStep: Map<string, number> }).lastStep.clear();
    return generateSync({ secret });
  };

  /** A tRPC call through the public dashboard. */
  const call = async (kind: 'query' | 'mutation', path: string, input: unknown, v: Visitor = {}) => {
    const res =
      kind === 'query'
        ? await fetch(
            `${t.d.url}/trpc/${path}${input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`}`,
            { headers: headersFor(v, false) },
          )
        : // No input goes batched, like the dashboard sends it.
          await fetch(`${t.d.url}/trpc/${path}${input === undefined ? '?batch=1' : ''}`, {
            method: 'POST',
            headers: headersFor(v, true),
            body: input === undefined ? '{}' : JSON.stringify(input),
          });
    const json = (await res.json()) as Reply | Reply[];
    const reply = Array.isArray(json) ? json[0]! : json;
    return { ...reply, status: res.status, setCookie: res.headers.get('set-cookie') };
  };
  const pubQuery = (path: string, input?: unknown, v?: Visitor) => call('query', path, input, v);
  const pubMutate = (path: string, input?: unknown, v?: Visitor) => call('mutation', path, input, v);

  /**
   * Both steps of signing in on the public dashboard as Hari (or `username` with `secret`): the session cookie (no
   * Domain) and the CSRF token, or the reply that stopped it.
   */
  const signInPublic = async (
    o: { username?: string; password?: string; secret?: string | null; ip?: string; country?: string } = {},
  ) => {
    const v = { ip: o.ip, country: o.country ?? 'NL' };
    const first = await pubMutate(
      'auth.login',
      { username: o.username ?? 'hari', password: o.password ?? PASSWORD, remember: true },
      v,
    );
    if (!first.result) return { first, second: null, cookie: null as string | null, csrf: null as string | null };
    const challengeId = first.result.data.challengeId as string;
    const second = await pubMutate('auth.verifyTotp', { challengeId, code: freshCode(o.secret ?? t.secret!) }, v);
    const cookie = second.setCookie?.split(';')[0] ?? null;
    let csrf: string | null = null;
    if (cookie)
      csrf = ((await pubQuery('auth.me', undefined, { ...v, cookie })).result?.data.csrfToken as string) ?? null;
    return { first, second, cookie, csrf };
  };

  /** Another person (display name Anu), made through an invite, with two-factor on unless `totp: false`. */
  const person = async (o: { username?: string; role?: 'admin' | 'member'; totp?: boolean } = {}) => {
    const m = await memberSession(t.d, { username: o.username ?? 'anu', role: o.role ?? 'member' });
    let secret: string | null = null;
    if (o.totp !== false) {
      secret = ((await m.mutate('account.totp.begin', { password: PASSWORD })).result!.data as { secret: string })
        .secret;
      const done = await m.mutate('account.totp.confirm', { code: generateSync({ secret }) });
      if (!done.result) throw new Error(`two-factor not on: ${JSON.stringify(done.error)}`);
    }
    return { ...m, secret };
  };

  const audits = (action: string) => t.s.db.select().from(auditLog).where(eq(auditLog.action, action)).all();
  const notes = (kind: string) => t.s.db.select().from(notifications).where(eq(notifications.kind, kind)).all();
  const sessionRows = () => t.s.db.select().from(sessions).all();
  return { ...t, setDashboard, pubQuery, pubMutate, signInPublic, freshCode, person, audits, notes, sessionRows };
}

export type PublicDashboardFixture = Awaited<ReturnType<typeof publicDashboardFixture>>;
export type { Fixture };
