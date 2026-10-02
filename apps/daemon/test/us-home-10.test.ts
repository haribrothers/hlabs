// US-HOME-10 · Find apps, actions, files, settings and store apps in one list: home.searchEverything, filtered for
// the person searching.
import { appAccess, getSetting, setSetting, users } from '@hlabs/db';
import { matchScore, ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Results = {
  installed: Array<{ id: string; name: string }>;
  actions: Array<{ kind: string; appId: string; appName: string }>;
  store: Array<{ id: string; name: string }> | null;
  storeTotal: number;
  files: unknown;
  settings: Array<{ section: string; title: string }>;
};

async function withKuma() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as {
    result: { data: { jobId: string } };
  };
  await t.s.jobs.settled(res.result.data.jobId);
  const search = async (query: string, cookie = t.d.cookie) => {
    const input = encodeURIComponent(JSON.stringify({ query }));
    const body = (await (
      await fetch(`${t.d.url}/trpc/home.searchEverything?input=${input}`, { headers: { cookie } })
    ).json()) as {
      result: { data: Results };
    };
    return body.result.data;
  };
  const member = () => {
    const id = ulid();
    t.s.db
      .insert(users)
      .values({ id, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    return { id, cookie: `hlabs_session=${t.s.sessions.create({ userId: id }).raw}` };
  };
  return { ...t, search, member };
}

describe('US-HOME-10', () => {
  it('matches ignore case and accents, and rank matches at the start first', () => {
    expect(matchScore('Jellyfin', 'jelly')).toBe(0);
    expect(matchScore('Restart Jellyfin', 'jelly')).toBe(1);
    expect(matchScore('Restart Jellyfin', 'restart jel')).toBe(0);
    expect(matchScore('Nextcloud', 'cloud')).toBe(2);
    expect(matchScore('Café', 'CAFE')).toBe(0);
    expect(matchScore('Jellyfin', 'jelly bean')).toBeNull();
    expect(matchScore('Jellyfin', '  ')).toBeNull();
  });

  it('with nothing typed, only the installed apps', async () => {
    const t = await withKuma();
    expect(await t.search('')).toEqual({
      installed: [expect.objectContaining({ id: 'uptime-kuma', name: 'Uptime Kuma' })],
      actions: [],
      store: [],
      storeTotal: 0,
      files: null,
      settings: [],
    });
  });

  it('an installed app, its actions; the App Store leaves out what is installed', async () => {
    const t = await withKuma();
    const r = await t.search('UPTIME');
    expect(r.installed.map((a) => a.id)).toEqual(['uptime-kuma']);
    expect(r.actions).toEqual([
      { kind: 'settings', appId: 'uptime-kuma', appName: 'Uptime Kuma' },
      { kind: 'restart', appId: 'uptime-kuma', appName: 'Uptime Kuma' },
      { kind: 'logs', appId: 'uptime-kuma', appName: 'Uptime Kuma' },
    ]);
    expect(r.store).toEqual([]);
    expect(r.files).toBeNull();
  });

  it('typing an action finds it first', async () => {
    const t = await withKuma();
    expect((await t.search('restart kuma')).actions[0]).toEqual({
      kind: 'restart',
      appId: 'uptime-kuma',
      appName: 'Uptime Kuma',
    });
  });

  it('App Store apps not installed yet, at most 3, with the total', async () => {
    const t = await withKuma();
    const r = await t.search('vault');
    expect(r.installed).toEqual([]);
    expect(r.store?.map((a) => a.id)).toEqual(['vaultwarden']);
    expect(r.storeTotal).toBe(1);
  });

  it('settings pages by title or what people call them', async () => {
    const t = await withKuma();
    expect((await t.search('password')).settings).toEqual([{ section: 'account', title: 'Account' }]);
    expect((await t.search('docker')).settings).toEqual([{ section: 'engine', title: 'Engine & startup' }]);
  });

  it('members: only shared apps, no actions, no admin settings, and no App Store unless members can install', async () => {
    const t = await withKuma();
    const anu = t.member();
    expect((await t.search('kuma', anu.cookie)).installed).toEqual([]);
    t.s.db.insert(appAccess).values({ appId: 'uptime-kuma', userId: anu.id }).run();
    const shared = await t.search('kuma', anu.cookie);
    expect(shared.installed.map((a) => a.id)).toEqual(['uptime-kuma']);
    expect(shared.actions).toEqual([]);
    expect(shared.store).toBeNull();
    expect((await t.search('docker', anu.cookie)).settings).toEqual([]);
    expect((await t.search('password', anu.cookie)).settings).toEqual([{ section: 'account', title: 'Account' }]);
    setSetting(t.s.db, 'people', { ...getSetting(t.s.db, 'people'), membersCanInstall: true });
    expect((await t.search('vault', anu.cookie)).store?.map((a) => a.id)).toEqual(['vaultwarden']);
  });
});
