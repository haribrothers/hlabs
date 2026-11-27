// US-SYS-47 · Some changes only work at home (D-182, 07 §7.11 control 5): from the public dashboard every procedure on
// HOME_ONLY_PROCEDURES is refused with HOME_ONLY, for everyone, admins too, enforced in the daemon and recorded in
// audit_log; making things private, turning off all public access and signing out everywhere still work there; and
// at home (or on the tailnet) nothing is refused. The contract test in packages/api makes every procedure choose.
import { HOME_ONLY_PROCEDURES, isHomeOnly } from '@hlabs/shared';
import { listProcedures } from '@hlabs/api';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonContext, type RequestInfo } from '../src/context';
import { viaOf } from '../src/http/via';
import { dispatcher } from '../src/routers/index';
import { DASH, publicDashboardFixture, type PublicDashboardFixture } from './public-dashboard-fixture';
import { PASSWORD } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** Hari (an admin) calling `path` with `via`, past tRPC's own validation: the daemon's check alone. */
function asAdmin(t: PublicDashboardFixture, via: RequestInfo['via']) {
  return new DaemonContext(
    t.d.holder,
    dispatcher,
    { kind: 'user', userId: t.d.userId, role: 'admin' },
    {
      ip: '203.0.113.7',
      userAgent: null,
      setupToken: null,
      csrfToken: null,
      origin: null,
      host: null,
      allowedOrigins: [],
      via,
      publicHost: via === 'public' ? DASH : null,
      country: null,
      setCookie: () => {},
    },
  );
}

const codeOf = (err: unknown) => (err as { cause?: { hlabsCode?: string } }).cause?.hlabsCode;

describe('US-SYS-47', () => {
  it('refuses every home-only procedure from the public dashboard with HOME_ONLY, admins too, and records it', async () => {
    const t = await publicDashboardFixture(closers);
    const ctx = asAdmin(t, 'public');
    const access = new Map(listProcedures().map((p) => [p.path, p.access]));
    for (const [path, rule] of Object.entries(HOME_ONLY_PROCEDURES)) {
      const input = rule === 'makingPublic' ? { appId: 'vaultwarden', public: true } : {};
      let code: string | undefined;
      try {
        // First-run setup, invites and reset links: refused before anything else is checked.
        ctx.authorize(access.get(path)!, path);
        await ctx.handle(path, input, undefined);
      } catch (err) {
        code = codeOf(err);
      }
      expect(code, path).toBe('HOME_ONLY');
    }
    const refused = t.audits('homeOnly.refused');
    expect(refused.map((a) => (a.detailJson as { procedure: string }).procedure).sort()).toEqual(
      Object.keys(HOME_ONLY_PROCEDURES).sort(),
    );
    expect(refused.filter((a) => !(a.detailJson as { procedure: string }).procedure.startsWith('onboarding.'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: t.d.userId, ip: '203.0.113.7' })]),
    );
    // Nothing changed: still public.
    expect(t.listener()).toMatchObject({ dashboard: { hostname: DASH } });
  });

  it('a request made some other way (not the UI) is refused the same, over HTTP with the public session', async () => {
    const t = await publicDashboardFixture(closers);
    const { cookie, csrf } = await t.signInPublic();
    const v = { cookie, csrf };
    const cases: Array<[string, unknown]> = [
      ['system.factoryReset', { password: PASSWORD, confirm: 'hlabs' }],
      ['account.changePassword', { currentPassword: PASSWORD, newPassword: 'another long password' }],
      ['apps.setPublic', { appId: 'vaultwarden', public: true }],
      ['public.setDashboardAccess', { emails: ['a@example.com'] }],
      ['users.updatePolicy', { requireTotp: false }],
      ['network.setHostname', { hostname: 'other' }],
      ['backups.exportRepoPassword', { password: PASSWORD }],
    ];
    for (const [path, input] of cases) {
      const reply = await t.pubMutate(path, input, v);
      // Input the procedure doesn't take is refused first, as anywhere; with valid input, HOME_ONLY.
      expect(['HOME_ONLY', 'VALIDATION_FAILED'], path).toContain(reply.error?.data.hlabsCode);
    }
    expect((await t.pubMutate('users.updatePolicy', { requireTotp: false }, v)).error?.data).toMatchObject({
      hlabsCode: 'HOME_ONLY',
      detail: { procedure: 'users.updatePolicy' },
    });
    expect((await t.pubMutate('apps.setPublic', { appId: 'vaultwarden', public: true }, v)).error?.data.hlabsCode).toBe(
      'HOME_ONLY',
    );
  });

  it('stopping exposure always works there: make private, turn off all, sign out everywhere', async () => {
    const t = await publicDashboardFixture(closers);
    await t.setPublic();
    const { cookie, csrf } = await t.signInPublic();
    const v = { cookie, csrf };
    const priv = await t.pubMutate('apps.setPublic', { appId: 'vaultwarden', public: false }, v);
    expect(priv.result).toBeTruthy();
    await t.s.jobs.settled(priv.result!.data.jobId as string);
    expect(t.publicRow()).toBeUndefined();
    expect((await t.pubMutate('auth.revokeOtherSessions', undefined, v)).result).toBeTruthy();
    const all = await t.pubMutate('public.turnOffAll', undefined, v);
    expect(all.result).toBeTruthy();
    await t.s.jobs.settled(all.result!.data.jobId as string);
    expect(t.listener()).toMatchObject({ dashboard: null });
    expect(t.audits('homeOnly.refused')).toEqual([]);
  });

  it('works as before at home and on the tailnet', async () => {
    const t = await publicDashboardFixture(closers);
    for (const via of ['home', 'tailnet'] as const) {
      const reply = await asAdmin(t, via).handle('users.updatePolicy', { requireTotp: false }, undefined);
      expect(reply, via).toMatchObject({ requireTotp: false });
    }
    expect((await t.d.mutate('users.updatePolicy', { membersCanInstall: true })).result).toBeTruthy();
    expect(t.audits('homeOnly.refused')).toEqual([]);
  });

  it('decides where a request came from: public only from the mark only the public listener sets', () => {
    expect(viaOf({ 'x-hlabs-via': 'public' }, null)).toBe('public');
    expect(viaOf({ 'x-hlabs-via': 'Public ' }, null)).toBe('public');
    expect(viaOf({ 'x-hlabs-via': 'home', host: DASH }, null)).toBe('home');
    expect(viaOf({ host: DASH }, null)).toBe('home');
  });

  it('the dashboard can tell which controls are home-only (isHomeOnly from @hlabs/shared)', () => {
    expect(isHomeOnly('system.factoryReset')).toBe(true);
    expect(isHomeOnly('apps.setPublic', { appId: 'x', public: false })).toBe(false);
    expect(isHomeOnly('files.list')).toBe(false);
  });
});
