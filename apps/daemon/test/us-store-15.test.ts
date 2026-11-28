// US-STORE-15 · See and apply available updates (server side): store.listUpdates with when each version reached the
// store and the updates of the last 14 days (manually or automatically); apps.updateAll queues every listed app in
// list order, one at a time, and one failing doesn't stop the rest; custom apps never appear; admins only.
import type { StoreUpdates } from '@hlabs/api';
import { apps, jobs } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { RECENT_MS } from '../src/store/updates-list';
import { memberSession } from './member-session';
import { storeImage } from './store-fixture';
import { newDigest, withInstalled } from './update-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function list(t: Awaited<ReturnType<typeof withInstalled>>) {
  return ((await t.d.query('store.listUpdates')) as Reply).result!.data as unknown as StoreUpdates;
}

describe('US-STORE-15', () => {
  it('each update says when its version reached the store; it stays the same until another version arrives', async () => {
    const t = await withInstalled(closers, ['uptime-kuma']);
    t.publish('uptime-kuma', '9.9.9');
    t.sync(5_000);
    t.sync(9_000);
    const [row] = (await list(t)).pending;
    expect(row).toMatchObject({ appId: 'uptime-kuma', toVersion: '9.9.9', releasedAt: 5_000, newAccess: null });
    t.publish('uptime-kuma', '9.9.10');
    t.sync(12_000);
    expect((await list(t)).pending[0]!.releasedAt).toBe(12_000);
  });

  it('a finished update moves to "Recently updated": by whom, the version, and without a destination not backed up', async () => {
    const t = await withInstalled(closers, ['uptime-kuma']);
    t.publish('uptime-kuma', '9.9.9');
    t.sync();
    const r = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(r.result!.data.jobId as string);
    const after = await list(t);
    expect(after.pending).toEqual([]);
    expect(after.recent).toEqual([
      {
        appId: 'uptime-kuma',
        name: 'Uptime Kuma',
        icon: expect.any(Object),
        version: '9.9.9',
        at: expect.any(Number),
        automatic: false,
        notBackedUp: true,
      },
    ]);
  });

  it('"Recently updated" keeps 14 days and says which were automatic', async () => {
    const t = await withInstalled(closers, ['uptime-kuma', 'vaultwarden']);
    const now = Date.now();
    const done = (target: string, finishedAt: number, payload: Record<string, unknown>) =>
      t.s.db
        .insert(jobs)
        .values({
          id: `job-${target}-${finishedAt}`,
          kind: 'app_update',
          target,
          state: 'succeeded',
          progress: 100,
          payloadJson: payload,
          createdAt: finishedAt,
          finishedAt,
        })
        .run();
    done('uptime-kuma', now - RECENT_MS - 1000, { userId: 'x', toVersion: '0.1', trigger: 'manual' });
    done('vaultwarden', now - 86_400_000, { userId: null, toVersion: '1.31', trigger: 'auto', backedUp: true });
    const { recent } = await list(t);
    expect(recent.map((r) => [r.appId, r.version, r.automatic, r.notBackedUp])).toEqual([
      ['vaultwarden', '1.31', true, false],
    ]);
  });

  it('Update all queues every listed app in list order; one failing doesn’t stop the rest', async () => {
    const t = await withInstalled(closers, ['vaultwarden', 'uptime-kuma']);
    t.publish('uptime-kuma', '9.9.9');
    t.publish('vaultwarden', '9.9.9');
    t.sync();
    // Uptime Kuma's new image can't be downloaded.
    t.engine.pullErrors.set(
      `${storeImage('uptime-kuma').split('@')[0]}@sha256:${newDigest('uptime-kuma')}`,
      new Error('no network'),
    );
    const res = (await t.d.mutate('apps.updateAll')) as Reply;
    const jobIds = res.result!.data.jobIds as string[];
    expect(jobIds).toHaveLength(2);
    const targets = jobIds.map((id) => t.s.db.select().from(jobs).where(eq(jobs.id, id)).get()!.target);
    // The list's order: by name.
    expect(targets).toEqual(['uptime-kuma', 'vaultwarden']);
    for (const id of jobIds) await t.s.jobs.settled(id).catch(() => undefined);
    const state = (id: string) => t.s.db.select().from(jobs).where(eq(jobs.id, id)).get()!.state;
    expect(jobIds.map(state)).toEqual(['failed', 'succeeded']);
    const versions = t.s.db.select({ id: apps.id, version: apps.version }).from(apps).all();
    expect(versions.find((v) => v.id === 'vaultwarden')?.version).toBe('9.9.9');
    expect(versions.find((v) => v.id === 'uptime-kuma')?.version).not.toBe('9.9.9');
  });

  it('custom apps never appear', async () => {
    const t = await withInstalled(closers, ['uptime-kuma']);
    t.publish('uptime-kuma', '9.9.9');
    t.sync();
    t.s.db.update(apps).set({ custom: true }).where(eq(apps.id, 'uptime-kuma')).run();
    const after = await list(t);
    expect(after.pending).toEqual([]);
    expect(((await t.d.mutate('apps.updateAll')) as Reply).result!.data).toEqual({ jobIds: [] });
  });

  it('members never see Updates', async () => {
    const t = await withInstalled(closers, []);
    const member = await memberSession(t.d);
    expect(((await member.query('store.listUpdates')) as Reply).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect(((await member.mutate('apps.updateAll')) as Reply).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
