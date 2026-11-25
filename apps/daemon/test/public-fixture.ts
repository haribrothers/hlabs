// Public apps (US-SYS-43, 44, US-APP-27…29): Vaultwarden installed and running on the fake engine, the admin (Hari)
// with two-factor on, the fake Cloudflare (example.com, with example.com, www and mail taken by the zone's own
// records), and helpers for hlabs's pages on the public address as Caddy's public listener reaches them.
import { appPublic, auditLog, notifications } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import type { Reply } from './admin-session';
import { settingsApp } from './config-fixture';
import { FAKE_CLOUDFLARE_TOKEN, type FakeCloudflare } from '../src/cloudflare/fake';
import type { NoopProxyManager } from '../src/caddy/index';

export const HOST = 'vaultwarden.example.com';
export const PASSWORD = 'correct horse battery';

/** The JSON a page carries for the bundle (`<script id="hlabs-page">`). */
export function pageData(html: string): Record<string, unknown> {
  const json = /<script id="hlabs-page" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1];
  return json ? (JSON.parse(json) as Record<string, unknown>) : {};
}

export async function publicFixture(
  closers: Array<() => Promise<void>>,
  opts: { extra?: string; totp?: boolean; setUp?: boolean } = {},
) {
  const t = await settingsApp(closers, { extra: opts.extra });
  const fake = t.s.cloudflare as FakeCloudflare;
  let secret: string | null = null;
  let step = 1;
  if (opts.totp !== false) {
    secret = ((await t.d.mutate('onboarding.setupTotp')).result!.data as { secret: string }).secret;
    await t.d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
  }
  /** A code from a later 30-second step each time, so none is a replay (US-AUTH-08). */
  const code = (of: string | null = secret) =>
    generateSync({ secret: of!, epoch: Math.floor(Date.now() / 1000) + 30 * step++ });

  const setUp = async () => {
    const reply = await t.d.mutate('public.setupCloudflare', { domain: 'example.com', token: FAKE_CLOUDFLARE_TOKEN });
    if (!reply.result) throw new Error(`setup failed: ${JSON.stringify(reply.error)}`);
    return t.s.jobs.settled(reply.result.data.jobId as string);
  };
  if (opts.setUp !== false) await setUp();

  /** `apps.setPublic` for Vaultwarden, waiting for its job. */
  const setPublic = async (input: Record<string, unknown> = {}) => {
    const reply = (await t.d.mutate('apps.setPublic', { appId: 'vaultwarden', public: true, ...input })) as Reply;
    const job = reply.result ? await t.s.jobs.settled(reply.result.data.jobId as string) : null;
    return { reply, job };
  };

  /** A request to hlabs's pages as the public listener sends it (X-Hlabs-Public-Host, the visitor's address). */
  const page = (
    method: 'GET' | 'POST',
    path: string,
    o: {
      host?: string;
      ip?: string;
      cookie?: string;
      origin?: string | null;
      form?: Record<string, string>;
      accept?: string;
      forwardedUri?: string;
    } = {},
  ) => {
    const host = o.host ?? HOST;
    const headers: Record<string, string> = {
      'x-hlabs-public-host': host,
      'x-forwarded-for': o.ip ?? '203.0.113.7',
      accept: o.accept ?? 'text/html',
    };
    if (o.cookie) headers.cookie = o.cookie;
    if (method === 'POST') {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      if (o.origin !== null) headers.origin = o.origin ?? `https://${host}`;
    }
    if (o.forwardedUri) {
      headers['x-forwarded-uri'] = o.forwardedUri;
      headers['x-forwarded-method'] = 'GET';
    }
    return fetch(`${t.d.url}${path}`, {
      method,
      headers,
      body: method === 'POST' ? new URLSearchParams(o.form ?? {}).toString() : undefined,
      redirect: 'manual',
    });
  };

  /** Both steps of signing in on the public address; the `__Host-hlabs_pub` cookie. */
  const signIn = async (
    o: { username?: string; password?: string; secret?: string | null; ip?: string; host?: string; next?: string } = {},
  ) => {
    const first = await page('POST', '/.hlabs/sign-in', {
      host: o.host,
      ip: o.ip,
      form: { username: o.username ?? 'hari', password: o.password ?? PASSWORD, next: o.next ?? '/' },
    });
    const data = pageData(await first.text());
    if (data.step !== 'code') return { first, data, cookie: null as string | null, second: null };
    const second = await page('POST', '/.hlabs/sign-in', {
      host: o.host,
      ip: o.ip,
      form: {
        challenge: data.challenge as string,
        code: code(o.secret === undefined ? secret : o.secret),
        next: o.next ?? '/',
      },
    });
    const setCookie = second.headers.get('set-cookie');
    return { first, data, second, cookie: setCookie ? setCookie.split(';')[0]! : null, setCookie };
  };

  /** Caddy's forward auth on the public address. */
  const verify = (o: { cookie?: string; host?: string; accept?: string; uri?: string } = {}) =>
    page('GET', '/auth/public-verify', {
      cookie: o.cookie,
      host: o.host,
      accept: o.accept,
      forwardedUri: o.uri ?? '/',
    });

  const audits = (action: string) => t.s.db.select().from(auditLog).where(eq(auditLog.action, action)).all();
  const notes = (kind: string) => t.s.db.select().from(notifications).where(eq(notifications.kind, kind)).all();
  const publicRow = () => t.s.db.select().from(appPublic).where(eq(appPublic.appId, 'vaultwarden')).get();
  const listener = () => (t.s.proxy as NoopProxyManager).last?.public ?? null;
  return { ...t, fake, secret, code, setUp, setPublic, page, signIn, verify, audits, notes, publicRow, listener };
}
