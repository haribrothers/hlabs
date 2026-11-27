// US-SYS-48 · Add Cloudflare's sign-in in front of the dashboard (D-182, 07 §7.11 control 7): an Access application for
// the dashboard's public name with a policy allowing the email addresses given (Cloudflare's one-time code by email),
// changed in place, removed; a credential that can't manage Access asks for a token with that permission, kept in the
// keychain with the credential; deleted when the dashboard goes private or the tunnel is removed; Access applications
// hlabs didn't make are never touched; the addresses only in settings, never in logs, jobs or the audit log. And the
// real Cloudflare API, with `fetch` faked: nothing here reaches Cloudflare.
import { auditLog, jobs, notifications } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { CloudflareApi } from '../src/cloudflare/api';
import { FAKE_CLOUDFLARE_ACCESS_TOKEN } from '../src/cloudflare/fake';
import { CloudflareError, type CloudflareCredential } from '../src/cloudflare/types';
import { CLOUDFLARE_CREDENTIAL } from '../src/public/service';
import type { Reply } from './admin-session';
import { DASH, publicDashboardFixture, type PublicDashboardFixture } from './public-dashboard-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const EMAILS = ['hari@example.net', 'asha@example.net', 'ravi@example.net'];

async function setAccess(t: PublicDashboardFixture, input: unknown) {
  const reply = (await t.d.mutate('public.setDashboardAccess', input)) as Reply;
  const job = reply.result ? await t.s.jobs.settled(reply.result.data.jobId as string) : null;
  return { reply, job };
}
const access = async (t: PublicDashboardFixture) =>
  ((await t.d.query('public.status')).result!.data as { dashboard: { cloudflareAccess: unknown } | null }).dashboard
    ?.cloudflareAccess;

describe('US-SYS-48', () => {
  it('needs the dashboard to be public first', async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    expect((await setAccess(t, { emails: EMAILS })).reply.error?.data.hlabsCode).toBe('DASHBOARD_NOT_PUBLIC');
  });

  it('adds an Access application for the dashboard’s name allowing those addresses, then changes and removes it', async () => {
    const t = await publicDashboardFixture(closers);
    const { job } = await setAccess(t, { emails: [...EMAILS, ' HARI@example.net '] });
    expect(job).toMatchObject({ kind: 'dashboard_access', state: 'succeeded' });
    expect([...t.fake.accessApps.values()]).toEqual([
      expect.objectContaining({ hostname: DASH, emails: EMAILS, byHlabs: true }),
    ]);
    expect(await access(t)).toEqual({ emails: EMAILS });
    expect(t.audits('dashboard.access.on')).toEqual([expect.objectContaining({ detailJson: { emails: 3 } })]);

    // Change…: the same application, its policy changed in place.
    const [made] = [...t.fake.accessApps.values()];
    await setAccess(t, { emails: ['hari@example.net'] });
    expect([...t.fake.accessApps.values()]).toEqual([
      expect.objectContaining({ appId: made!.appId, emails: ['hari@example.net'] }),
    ]);
    expect(t.audits('dashboard.access.changed')).toEqual([expect.objectContaining({ detailJson: { emails: 1 } })]);

    // Remove.
    await setAccess(t, { off: true });
    expect(t.fake.accessApps.size).toBe(0);
    expect(await access(t)).toBeNull();
  });

  it("the addresses are kept in settings only: never in the audit log, a job's payload or a notification", async () => {
    const t = await publicDashboardFixture(closers);
    await setAccess(t, { emails: EMAILS });
    await setAccess(t, { emails: EMAILS.slice(0, 1) });
    const text = JSON.stringify([
      t.s.db.select().from(auditLog).all(),
      t.s.db.select().from(jobs).all(),
      t.s.db.select().from(notifications).all(),
    ]);
    for (const email of EMAILS) expect(text).not.toContain(email);
  });

  it("a credential that can't manage Access asks for a token with that permission, kept with the credential", async () => {
    const t = await publicDashboardFixture(closers);
    t.fake.accessDenied = true;
    expect((await setAccess(t, { emails: EMAILS })).reply.error?.data).toMatchObject({
      hlabsCode: 'CLOUDFLARE_FAILED',
      detail: { step: 'access', needsToken: true },
    });
    const wrong = await setAccess(t, { emails: EMAILS, token: 'not-a-token-that-can-manage-access' });
    expect(wrong.reply.error?.data).toMatchObject({ detail: { step: 'access', needsToken: true } });
    expect(t.fake.accessApps.size).toBe(0);
    const { job } = await setAccess(t, { emails: EMAILS, token: FAKE_CLOUDFLARE_ACCESS_TOKEN });
    expect(job?.state).toBe('succeeded');
    const kept = JSON.parse((await t.s.secrets.get(CLOUDFLARE_CREDENTIAL))!) as CloudflareCredential;
    expect(kept.accessToken).toBe(FAKE_CLOUDFLARE_ACCESS_TOKEN);
    expect(t.fake.accessApps.size).toBe(1);
  });

  it("a failure at Cloudflare is CLOUDFLARE_FAILED { step: 'access' } and keeps nothing", async () => {
    const t = await publicDashboardFixture(closers);
    t.fake.failing = new Set(['access']);
    expect((await setAccess(t, { emails: EMAILS })).reply.error?.data).toMatchObject({
      hlabsCode: 'CLOUDFLARE_FAILED',
      detail: { step: 'access' },
    });
    expect(await access(t)).toBeNull();
  });

  it('is deleted when the dashboard is made private, and when the tunnel is removed; others are never touched', async () => {
    const t = await publicDashboardFixture(closers);
    t.fake.accessApps.set('theirs', {
      appId: 'theirs',
      policyId: 'p',
      hostname: 'intranet.example.com',
      emails: ['x@example.net'],
      byHlabs: false,
    });
    await setAccess(t, { emails: EMAILS });
    await t.setDashboard({ public: false });
    expect([...t.fake.accessApps.keys()]).toEqual(['theirs']);

    await t.setDashboard();
    await setAccess(t, { emails: EMAILS });
    const reply = (await t.d.mutate('public.remove')) as Reply;
    await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect([...t.fake.accessApps.keys()]).toEqual(['theirs']);
  });
});

describe('US-SYS-48 · the real Cloudflare API (fetch faked)', () => {
  const cred: CloudflareCredential = {
    kind: 'signIn',
    token: 'zone-token',
    zoneId: 'z1',
    accountId: 'acc1',
    domain: 'example.com',
  };
  function api(answers: Array<{ match: RegExp; status?: number; body: unknown }>) {
    const calls: Array<{ method: string; url: string; auth: string | null; body: unknown }> = [];
    const client = new CloudflareApi({
      binary: '/nonexistent',
      dir: '/tmp/nonexistent',
      fetch: async (url, init) => {
        const method = init.method ?? 'GET';
        calls.push({
          method,
          url,
          auth: (init.headers as Record<string, string>).authorization ?? null,
          body: init.body ? JSON.parse(init.body as string) : null,
        });
        const answer = answers.find((a) => a.match.test(`${method} ${url}`));
        if (!answer) return new Response(JSON.stringify({ success: false, errors: [] }), { status: 500 });
        return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
      },
    });
    return { client, calls };
  }

  it('makes the one-time PIN login when there is none, the application and its policy, with the Access token', async () => {
    const { client, calls } = api([
      { match: /^GET .*\/accounts\/acc1\/access\/identity_providers$/, body: { success: true, result: [] } },
      {
        match: /^POST .*\/accounts\/acc1\/access\/identity_providers$/,
        body: { success: true, result: { id: 'otp' } },
      },
      { match: /^POST .*\/accounts\/acc1\/access\/apps$/, body: { success: true, result: { id: 'app1' } } },
      { match: /^POST .*\/access\/apps\/app1\/policies$/, body: { success: true, result: { id: 'pol1' } } },
    ]);
    const made = await client.createAccessApp(
      { ...cred, accessToken: 'access-token' },
      { hostname: DASH, emails: EMAILS },
    );
    expect(made).toEqual({ appId: 'app1', policyId: 'pol1' });
    expect(calls.every((c) => c.auth === 'Bearer access-token')).toBe(true);
    expect(calls[1]!.body).toMatchObject({ type: 'onetimepin' });
    expect(calls[2]!.body).toMatchObject({
      domain: DASH,
      type: 'self_hosted',
      allowed_idps: ['otp'],
      auto_redirect_to_identity: true,
    });
    expect(calls[3]!.body).toEqual({
      name: 'hlabs: allowed email addresses',
      decision: 'allow',
      include: EMAILS.map((email) => ({ email: { email } })),
      precedence: 1,
    });
  });

  it("uses the account's one-time PIN login when it has one, and deletes the application if its policy fails", async () => {
    const { client, calls } = api([
      {
        match: /^GET .*identity_providers$/,
        body: {
          success: true,
          result: [
            { id: 'gh', type: 'github' },
            { id: 'pin', type: 'onetimepin' },
          ],
        },
      },
      { match: /^POST .*\/access\/apps$/, body: { success: true, result: { id: 'app2' } } },
      {
        match: /^POST .*\/apps\/app2\/policies$/,
        status: 400,
        body: { success: false, errors: [{ code: 1, message: 'bad' }] },
      },
      { match: /^DELETE .*\/access\/apps\/app2$/, body: { success: true, result: null } },
    ]);
    await expect(client.createAccessApp(cred, { hostname: DASH, emails: EMAILS })).rejects.toThrow(CloudflareError);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST', 'DELETE']);
    expect((calls[1]!.body as { allowed_idps: string[] }).allowed_idps).toEqual(['pin']);
    expect(calls[0]!.auth).toBe('Bearer zone-token');
  });

  it("Cloudflare's sign-in always asks for the token: it reads Access but can't change it (D-187)", async () => {
    // What Hari's account did (Q-25): both reads answered with the sign-in, then adding the one-time PIN login was
    // refused with 403 {"code":1010,"error":"auth.forbidden"} partway through the job.
    const { client, calls } = api([
      { match: /^GET .*\/access\//, body: { success: true, result: [] } },
      {
        match: /^POST .*\/access\/identity_providers$/,
        status: 403,
        body: { success: false, errors: [{ code: 1010, error: 'auth.forbidden' }] },
      },
    ]);
    const err = await client.checkAccess(cred).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudflareError);
    expect(err).toMatchObject({ step: 'access', denied: true });
    expect(calls).toHaveLength(0);
    // With a token it checks with the token.
    await client.checkAccess({ ...cred, accessToken: 'access-token' });
    expect(calls.map((c) => c.auth)).toEqual(['Bearer access-token', 'Bearer access-token']);
  });

  it('says a credential that Cloudflare refuses for Access is denied (so a token is asked for)', async () => {
    const { client } = api([
      {
        match: /^GET .*\/access\/apps\?per_page=1$/,
        status: 403,
        body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] },
      },
    ]);
    const err = await client.checkAccess({ ...cred, kind: 'token' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudflareError);
    expect(err).toMatchObject({ step: 'access', denied: true });
  });

  it('checks the login methods too: a token that can manage applications but not login methods is asked for again (D-186)', async () => {
    // What Hari's account answered (Q-25): the applications were fine, the login methods refused with code 1010 and
    // no message.
    const { client } = api([
      { match: /^GET .*\/access\/apps\?per_page=1$/, body: { success: true, result: [] } },
      {
        match: /^GET .*\/access\/identity_providers$/,
        status: 403,
        body: { success: false, errors: [{ code: 1010 }] },
      },
    ]);
    const err = await client.checkAccess({ ...cred, kind: 'token' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudflareError);
    expect(err).toMatchObject({ step: 'access', denied: true });
    // Cloudflare's answer as it gave it, with the status and the call; never "undefined", never the token.
    const message = (err as Error).message;
    expect(message).toBe('{"code":1010} (HTTP 403, GET /accounts/acc1/access/identity_providers)');
    expect(message).not.toContain('zone-token');
  });

  it('changes the policy in place, and deleting an application already gone is fine', async () => {
    const { client, calls } = api([
      { match: /^PUT .*\/access\/apps\/app1\/policies\/pol1$/, body: { success: true, result: { id: 'pol1' } } },
      { match: /^DELETE .*\/access\/apps\/gone$/, status: 404, body: { success: false, errors: [] } },
    ]);
    await client.updateAccessPolicy(cred, { appId: 'app1', policyId: 'pol1' }, ['a@example.net']);
    expect(calls[0]!.body).toMatchObject({ include: [{ email: { email: 'a@example.net' } }] });
    await expect(client.deleteAccessApp(cred, 'gone')).resolves.toBeUndefined();
  });
});
