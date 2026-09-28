// US-SYS-20 · Control startup behaviour (server side).
import type { HlabsEvent } from '@hlabs/api';
import { apps, getSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { FakeSleepBlocker } from './fakes/sleep-blocker';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withBlocker() {
  const blocker = new FakeSleepBlocker();
  const d = await daemonWithAdmin(closers, {}, { sleepBlocker: blocker });
  return { ...d, blocker };
}

describe('US-SYS-20', () => {
  it('all three are on by default', async () => {
    const d = await withBlocker();
    expect((await d.query('settings.get')).result!.data).toEqual({
      startup: { startAtLogin: true, autostartApps: true, keepAwake: true },
    });
  });

  it('start at login is saved and handed to the tray (startup.changeRequested, tray-only); the others just save', async () => {
    const d = await withBlocker();
    const events: Array<{ event: HlabsEvent; audience: unknown }> = [];
    d.services!.bus.on((e) => events.push({ event: e.event, audience: e.audience }));
    expect((await d.mutate('settings.startup.update', { startAtLogin: false })).result?.data).toEqual({ ok: true });
    expect(getSetting(d.services!.db, 'startup').startAtLogin).toBe(false);
    expect(events).toEqual([
      {
        event: expect.objectContaining({ type: 'startup.changeRequested', data: { startAtLogin: false } }),
        audience: { kind: 'tray' },
      },
    ]);
    await d.mutate('settings.startup.update', { autostartApps: false });
    expect(getSetting(d.services!.db, 'startup')).toMatchObject({
      startAtLogin: false,
      autostartApps: false,
      keepAwake: true,
    });
    expect(events).toHaveLength(1);
  });

  it('keeps the computer awake only while the setting is on and an app runs', async () => {
    const d = await withBlocker();
    const s = d.services!;
    expect(d.blocker.active).toBe(false);
    s.db
      .insert(apps)
      .values({ id: 'kuma', version: '1', state: 'running', hostname: 'kuma', installedAt: 1, updatedAt: 1 })
      .run();
    s.bus.emit('app.stateChanged', { appId: 'kuma', state: 'running', detail: null });
    expect(d.blocker.active).toBe(true);
    await d.mutate('settings.startup.update', { keepAwake: false });
    expect(d.blocker.active).toBe(false);
    await d.mutate('settings.startup.update', { keepAwake: true });
    expect(d.blocker.active).toBe(true);
    s.db.update(apps).set({ state: 'stopped' }).where(eq(apps.id, 'kuma')).run();
    s.bus.emit('app.stateChanged', { appId: 'kuma', state: 'stopped', detail: null });
    expect(d.blocker.active).toBe(false);
  });
});
