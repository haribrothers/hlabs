// US-SYS-44 · See and stop everything that's public: public.status lists every public app (name, address, who can get
// in, since when and by whom); "Turn off all public access" makes every one private in one job, the tunnel staying
// set up, audited, the other admins told; the menu-bar app shows how many are public and turns them off the same way
// (tray.publicOff, after the computer's own confirmation); and it works even while an exclusive job runs.
import { jobs as jobsTable } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonContext } from '../src/context';
import { dispatcher } from '../src/routers/index';
import type { Reply } from './admin-session';
import { memberSession } from './member-session';
import { HOST, publicFixture } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A call as the menu-bar app makes it, with its token (checked by DaemonContext.authorize). */
async function asTray(t: Awaited<ReturnType<typeof publicFixture>>, path: string) {
  const ctx = new DaemonContext(
    t.d.holder,
    dispatcher,
    { kind: 'tray' },
    {
      ip: '127.0.0.1',
      userAgent: null,
      setupToken: null,
      csrfToken: null,
      origin: null,
      host: null,
      allowedOrigins: [],
      setCookie: () => {},
    },
  );
  ctx.authorize(['tray'], path);
  return ctx.handle(path, undefined, undefined);
}

describe('US-SYS-44', () => {
  it('with nothing public, the list is empty and the menu bar says nothing', async () => {
    const t = await publicFixture(closers);
    expect(((await t.d.query('public.status')).result!.data as { apps: unknown[] }).apps).toEqual([]);
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicApps: 0, publicAppNames: [] });
  });

  it('lists each public app: name, address, who can get in, since when and by whom', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const s = (await t.d.query('public.status')).result!.data as { apps: Array<Record<string, unknown>> };
    expect(s.apps).toEqual([
      {
        appId: 'vaultwarden',
        name: 'Vaultwarden',
        icon: expect.objectContaining({ logoUrl: expect.any(String) }),
        address: `https://${HOST}`,
        hostname: HOST,
        access: 'hlabs',
        since: expect.any(Number),
        by: 'Hari',
      },
    ]);
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicApps: 1, publicAppNames: ['Vaultwarden'] });
  });

  it('"Turn off all public access" makes every app private in one job; the tunnel stays; audited; others told', async () => {
    const t = await publicFixture(closers);
    const asha = await memberSession(t.d, { role: 'admin', username: 'asha' });
    await t.setPublic();
    const reply = (await t.d.mutate('public.turnOffAll')) as Reply;
    const job = await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect(job).toMatchObject({ kind: 'public_off_all', state: 'succeeded' });
    expect(t.publicRow()).toBeUndefined();
    expect(t.listener()!.apps).toEqual([]);
    expect(t.fake.hlabsRecords()).toEqual([]);
    // Cloudflare Tunnel stays set up, its connector running.
    expect(
      ((await t.d.query('public.status')).result!.data as { cloudflare: { state: string } }).cloudflare.state,
    ).toBe('on');
    expect(t.fake.state()).toBe('running');
    expect(t.audits('public.turnedOffAll')).toEqual([
      expect.objectContaining({ userId: t.d.userId, detailJson: { apps: ['vaultwarden'], via: 'dashboard' } }),
    ]);
    expect(t.notes('public.turned_off')).toEqual([
      expect.objectContaining({ userId: asha.userId, title: 'Hari turned off all public access' }),
    ]);
  });

  it('the menu-bar app turns it all off too, audited as the menu bar and told to every admin', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const { jobId } = (await asTray(t, 'tray.publicOff')) as { jobId: string };
    await t.s.jobs.settled(jobId);
    // The tray follows the job with its token.
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicApps: 0 });
    expect(t.publicRow()).toBeUndefined();
    expect(t.audits('public.turnedOffAll')).toEqual([
      expect.objectContaining({ userId: null, detailJson: { apps: ['vaultwarden'], via: 'tray' } }),
    ]);
    expect(t.notes('public.turned_off')).toEqual([
      expect.objectContaining({ userId: t.d.userId, title: 'Public access was turned off from the menu bar' }),
    ]);
  });

  it('stopping what strangers can reach never waits for, or is refused by, an exclusive job (D-179)', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    // A restore under way (exclusive, D-020): other jobs are refused.
    t.s.db
      .insert(jobsTable)
      .values({ id: ulid(), kind: 'restore', target: null, state: 'running', progress: 10, createdAt: Date.now() })
      .run();
    expect(t.s.jobs.blocker('app_update')).toBe('restore');
    expect(t.s.jobs.blocker('public_off_all')).toBeNull();
    const reply = (await t.d.mutate('public.turnOffAll')) as Reply;
    expect((await t.s.jobs.settled(reply.result!.data.jobId as string))?.state).toBe('succeeded');
    expect(t.publicRow()).toBeUndefined();
  });

  it("members can't turn it off or see the list", async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const anu = await memberSession(t.d, { appIds: ['vaultwarden'] });
    expect((await anu.mutate('public.turnOffAll')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect((await anu.query('public.status')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect(() => t.s.publicApps.turnOffAll({ userId: anu.userId, role: 'member' }, 'dashboard')).toThrow();
    expect(t.publicRow()).toBeDefined();
  });
});
