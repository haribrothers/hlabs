// US-USE-02 · Tiles update live and respect who may see them (server side): a member allowed to see live usage gets
// the host and only their apps, in usage.current, usage.history and the usage.sample events; otherwise usage.* is
// refused (D-029).
import { apps, getSetting, setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';
import { readSse } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const running = (id: string) =>
  ({
    id,
    service: 'web',
    state: 'running',
    health: null,
    image: 'x',
    imageId: 'sha256:x',
    startedAt: 1,
    exitCode: null,
  }) as never;

async function setup(allowed: boolean) {
  const d = await daemonWithAdmin(closers);
  const s = d.services!;
  s.db
    .insert(apps)
    .values(
      ['immich', 'vault'].map(
        (id) => ({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 }) as never,
      ),
    )
    .run();
  for (const id of ['immich', 'vault']) d.engine.containers.set(`hlabs-${id}`, [running(`${id}-c`)]);
  const anu = await memberSession(d, { appIds: ['immich'] });
  setSetting(s.db, 'people', { ...getSetting(s.db, 'people'), membersCanSeeUsage: allowed });
  await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: ['immich'], canSeeUsage: allowed });
  return { d, s, anu };
}

describe('US-USE-02', () => {
  it('an allowed member sees the host and only their apps', async () => {
    const { s, anu } = await setup(true);
    await s.usage.sample();
    const current = (await anu.query('usage.current')).result!.data as {
      host: unknown;
      apps: Array<{ appId: string }>;
    };
    expect(current.host).toBeDefined();
    expect(current.apps.map((a) => a.appId)).toEqual(['immich']);
    expect((await anu.query('usage.history', { scope: 'immich', range: '1h' })).status).toBe(200);
    expect((await anu.query('usage.history', { scope: 'vault', range: '1h' })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
    expect((await anu.query('usage.history', { scope: 'host', range: '1h' })).status).toBe(200);
  });

  it("the member's event stream gets samples with only their apps", async () => {
    const { d, s, anu } = await setup(true);
    const res = await fetch(`${d.url}/trpc/events.stream`, {
      headers: { accept: 'text/event-stream', cookie: anu.cookie },
    });
    setTimeout(() => void s.usage.sample(), 100);
    const text = await readSse(res, (t) => t.includes('usage.sample'));
    expect(text).toContain('"appId":"immich"');
    expect(text).not.toContain('"appId":"vault"');
  });

  it('an admin sees every app', async () => {
    const { d, s } = await setup(true);
    await s.usage.sample();
    const current = (await d.query('usage.current')).result!.data as { apps: Array<{ appId: string }> };
    expect(current.apps.map((a) => a.appId).sort()).toEqual(['immich', 'vault']);
  });

  it('a member not allowed is refused usage.*', async () => {
    const { anu } = await setup(false);
    for (const [path, input] of [
      ['usage.current', undefined],
      ['usage.overview', undefined],
      ['usage.history', { scope: 'host', range: '1h' }],
    ] as const) {
      const r = await anu.query(path, input);
      expect(r.status).toBe(403);
      expect(r.error?.data.hlabsCode).toBe('ACCESS_DENIED');
    }
  });
});
