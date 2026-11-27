// US-APP-27 · Make an app public: "Make public…" (its address under the Cloudflare domain, suggested from the app),
// the `public_on` job, the Public badge in apps.get and apps.list, audit, the other admins told, `public.allowed:
// false` (and the Docker socket) never public, Make private, automatic updates kept on while public, uninstalling
// making it private first, and a stopped app's "isn't running" page on its public address.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoopProxyManager } from '../src/caddy/index';
import type { Reply } from './admin-session';
import { memberSession } from './member-session';
import { HOST, pageData, publicFixture } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-APP-27', () => {
  it('"Make public…" knows the domain, suggests a name from the app, and who can get in', async () => {
    const before = await publicFixture(closers, { setUp: false });
    const none = (await before.d.query('apps.publicOptions', { appId: 'vaultwarden' })).result!.data;
    expect(none).toMatchObject({ domain: null, allowed: true, ownLoginSafe: false, media: false, current: null });

    const t = await publicFixture(closers);
    const options = (await t.d.query('apps.publicOptions', { appId: 'vaultwarden' })).result!.data;
    expect(options).toMatchObject({
      domain: 'example.com',
      suggestedLabel: 'vaultwarden',
      taken: [],
      allowed: true,
      reason: null,
      people: [expect.objectContaining({ displayName: 'Hari', role: 'admin', totpEnabled: true })],
    });
  });

  it('confirmed, a public_on job sets up the address; the app shows Public; audited; the other admins are told', async () => {
    const t = await publicFixture(closers);
    const asha = await memberSession(t.d, { role: 'admin', username: 'asha' });
    const events: string[] = [];
    t.s.bus.on(({ event }) => {
      if (event.type === 'app.publicChanged') events.push(JSON.stringify(event.data));
    });
    const { reply, job } = await t.setPublic({ hostname: 'vaultwarden' });
    expect(reply.result).toBeDefined();
    expect(job).toMatchObject({ kind: 'public_on', target: 'vaultwarden', state: 'succeeded' });

    const detail = (await t.d.query('apps.get', { appId: 'vaultwarden' })).result!.data;
    expect(detail.public).toEqual({
      address: `https://${HOST}`,
      hostname: HOST,
      access: 'hlabs',
      since: expect.any(Number),
      by: 'Hari',
    });
    const list = (await t.d.query('apps.list')).result!.data as { apps: Array<{ id: string; public: unknown }> };
    expect(list.apps.find((a) => a.id === 'vaultwarden')!.public).toMatchObject({ address: `https://${HOST}` });
    // Its route on the public listener, and its record in the domain's DNS.
    expect(t.listener()!.apps).toEqual([
      { appId: 'vaultwarden', hostname: HOST, port: expect.any(Number), access: 'hlabs', maxBodyMb: 10 },
    ]);
    expect(t.fake.hlabsRecords()).toEqual([HOST]);
    expect(t.audits('app.public.on')).toEqual([
      expect.objectContaining({
        userId: t.d.userId,
        target: 'vaultwarden',
        detailJson: { address: `https://${HOST}`, access: 'hlabs' },
      }),
    ]);
    const told = t.notes('app.public_on');
    expect(told).toEqual([
      expect.objectContaining({
        userId: asha.userId,
        severity: 'info',
        title: `Hari made Vaultwarden public at https://${HOST}`,
      }),
    ]);
    expect(events).toEqual([JSON.stringify({ appId: 'vaultwarden', public: true })]);
  });

  it("a name the domain's DNS has already is refused; the app's own name again is fine", async () => {
    const t = await publicFixture(closers);
    t.s.db.update(apps).set({ hostname: 'vault' }).where(eq(apps.id, 'vaultwarden')).run();
    await t.setPublic({ hostname: 'photos' });
    t.fake.records.set('x', { id: 'x', name: 'blog.example.com', content: '192.0.2.1', byHlabs: false });
    const blog = await t.setPublic({ hostname: 'blog' });
    expect(blog.reply.error?.data.hlabsCode).toBe('PUBLIC_HOSTNAME_TAKEN');
    // Its own name again is fine (no change).
    const same = await t.setPublic({ hostname: 'photos' });
    expect(same.job?.state).toBe('succeeded');
  });

  it("an app whose manifest says public.allowed: false can't be made public, with the manifest's reason", async () => {
    const t = await publicFixture(closers, {
      extra: 'public:\n  allowed: false\n  reason: It can read every password in your home.\n',
    });
    const options = (await t.d.query('apps.publicOptions', { appId: 'vaultwarden' })).result!.data;
    expect(options).toMatchObject({ allowed: false, reason: 'It can read every password in your home.' });
    const { reply } = await t.setPublic();
    expect(reply.error?.data).toMatchObject({
      hlabsCode: 'PUBLIC_NOT_ALLOWED',
      detail: { reason: 'It can read every password in your home.' },
    });
    expect(t.fake.hlabsRecords()).toEqual([]);
  });

  it('an app that can control the others (the Docker socket) is never public, whatever its manifest says', async () => {
    const t = await publicFixture(closers);
    expect(t.s.publicApps.policy('vaultwarden').allowed).toBe(true);
    const manifest = t.s.apps.manifest('vaultwarden');
    const projectFile = `${t.projectDir}/hlabs-app.json`;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      projectFile,
      JSON.stringify({ ...manifest, permissions: { ...manifest.permissions, dockerSocket: true } }),
    );
    expect(t.s.publicApps.policy('vaultwarden')).toMatchObject({ allowed: false, reason: null });
  });

  it("a media app gets the note on Cloudflare's terms (`media`)", async () => {
    const t = await publicFixture(closers);
    t.s.db.update(apps).set({ sourceId: null }).where(eq(apps.id, 'vaultwarden')).run();
    const manifest = t.s.apps.manifest('vaultwarden');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${t.projectDir}/hlabs-app.json`, JSON.stringify({ ...manifest, category: 'media' }));
    // The store listing wins when there is one; this app's comes from its installed copy now.
    t.s.db.delete((await import('@hlabs/db')).catalogApps).run();
    expect((await t.d.query('apps.publicOptions', { appId: 'vaultwarden' })).result!.data.media).toBe(true);
  });

  it('"Make private" stops the address at once, deletes its record and ends sign-ins there, audited', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const { cookie } = await t.signIn();
    expect((await t.verify({ cookie: cookie! })).status).toBe(200);
    const off = (await t.d.mutate('apps.setPublic', { appId: 'vaultwarden', public: false })) as Reply;
    const job = await t.s.jobs.settled(off.result!.data.jobId as string);
    expect(job).toMatchObject({ kind: 'public_off', state: 'succeeded' });
    expect(t.publicRow()).toBeUndefined();
    expect(t.listener()!.apps).toEqual([]);
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect((await t.d.query('apps.get', { appId: 'vaultwarden' })).result!.data.public).toBeNull();
    // The address answers 404 now, and its sign-ins are over.
    expect((await t.verify({ cookie: cookie! })).status).toBe(404);
    expect(t.audits('app.public.off')).toEqual([
      expect.objectContaining({ target: 'vaultwarden', detailJson: expect.objectContaining({ why: 'private' }) }),
    ]);
  });

  it('while public, automatic updates are on and stay on; private again, they can be turned off', async () => {
    const t = await publicFixture(closers);
    expect(t.row().autoUpdate).toBe(false);
    await t.setPublic();
    expect(t.row().autoUpdate).toBe(true);
    expect(t.audits('app.setAutoUpdate')).toEqual([
      expect.objectContaining({ detailJson: { from: false, to: true, why: 'public' } }),
    ]);
    const refused = await t.d.mutate('apps.setAutoUpdate', { appId: 'vaultwarden', enabled: false });
    expect(refused.error?.data.hlabsCode).toBe('APP_IS_PUBLIC');
    expect(t.row().autoUpdate).toBe(true);
    const off = (await t.d.mutate('apps.setPublic', { appId: 'vaultwarden', public: false })) as Reply;
    await t.s.jobs.settled(off.result!.data.jobId as string);
    expect((await t.d.mutate('apps.setAutoUpdate', { appId: 'vaultwarden', enabled: false })).result).toBeDefined();
  });

  it('uninstalling a public app makes it private first', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const reply = (await t.d.mutate('apps.uninstall', { appId: 'vaultwarden', keepData: false })) as Reply;
    // Its address stops answering as soon as it's uninstalling.
    expect(t.listener()!.apps).toEqual([]);
    await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect(t.audits('app.public.off')).toEqual([
      expect.objectContaining({ target: 'vaultwarden', detailJson: expect.objectContaining({ why: 'uninstall' }) }),
    ]);
  });

  it('a stopped public app shows "<App> isn\'t running" on its address, saying nothing else', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const res = await t.page('GET', '/auth/unavailable');
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(pageData(await res.text())).toEqual({
      kind: 'appNotRunning',
      appName: 'Vaultwarden',
      icon: expect.any(Object),
      host: HOST,
    });
    // On an address that isn't public: no such page.
    expect((await t.page('GET', '/auth/unavailable', { host: 'nope.example.com' })).status).toBe(404);
  });

  it("members can't make anything public or private", async () => {
    const t = await publicFixture(closers);
    const anu = await memberSession(t.d, { appIds: ['vaultwarden'] });
    const on = await anu.mutate('apps.setPublic', { appId: 'vaultwarden', public: true });
    expect(on.error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect((await anu.query('apps.publicOptions', { appId: 'vaultwarden' })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
    // The service says no too, not only the router.
    expect(() => t.s.publicApps.options('vaultwarden', { userId: anu.userId, role: 'member' })).toThrow();
    await expect(
      t.s.publicApps.setPublic({ userId: anu.userId, role: 'member' }, { appId: 'vaultwarden', public: true }),
    ).rejects.toThrow();
    // A member sees the badge on an app shared with them (it's public anyway), and nothing more.
    await t.setPublic();
    const detail = (await anu.query('apps.get', { appId: 'vaultwarden' })).result!.data;
    expect((detail.public as { address: string }).address).toBe(`https://${HOST}`);
  });

  it('the public listener answers only public addresses (an unknown name is 404)', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const { buildCaddyConfig } = await import('../src/caddy/config');
    const config = buildCaddyConfig((t.s.proxy as NoopProxyManager).last!, {
      storageDir: '/c',
      adminSocket: '/c/a.sock',
      logFile: '/c/log',
      webFallbackDir: '/f',
    }) as unknown as {
      apps: { http: { servers: Record<string, { listen: string[]; routes: Array<Record<string, unknown>> }> } };
    };
    const server = config.apps.http.servers.public!;
    expect(server.listen).toEqual([`127.0.0.1:${t.d.config.publicPort}`]);
    const hosts = server.routes.flatMap((r) =>
      ((r.match as Array<{ host?: string[] }> | undefined) ?? []).flatMap((m) => m.host ?? []),
    );
    expect(hosts).toEqual([HOST]);
    expect(server.routes.at(-1)).toMatchObject({ handle: [{ handler: 'static_response', status_code: 404 }] });
    // Not on the dashboard's server, nor any app's own port.
    const elsewhere = JSON.stringify(Object.entries(config.apps.http.servers).filter(([name]) => name !== 'public'));
    expect(elsewhere).not.toContain(HOST);
  });
});
