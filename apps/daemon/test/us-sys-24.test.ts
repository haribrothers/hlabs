// US-SYS-24 · Check for updates now (server side): settings.updates.check reads the update manifest on the chosen
// channel and refreshes the store index; what it found is kept, a failed check (offline) keeps the previous result;
// each newer version is announced once with update.available; and hlabs checks by itself every 6 hours.
import { getSetting, setSetting } from '@hlabs/db';
import type { HlabsEvent } from '@hlabs/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/logger';
import { EventBus } from '../src/events/bus';
import { CHECK_EVERY_MS, HlabsUpdates } from '../src/updates/service';
import { noteBullets } from '../src/updates/source';
import { compareVersions } from '../src/updates/version';
import { daemonWithAdmin } from './admin-session';
import { FakeUpdateSource } from './fakes/update-source';
import { memberSession } from './member-session';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of closers.splice(0)) await close();
});

const NOTES = ['## What changed', '- Faster app installs', '* Live usage', '- One', '- Two', '- Three', '- Six'].join(
  '\n',
);

async function setup() {
  const source = new FakeUpdateSource();
  const d = await daemonWithAdmin(closers, { version: '1.4.0' }, { updateSource: source });
  const events: HlabsEvent[] = [];
  d.services!.bus.on((e) => events.push(e.event));
  return { d, source, events, available: () => events.filter((e) => e.type === 'update.available') };
}

describe('US-SYS-24 · Check for updates now', () => {
  it('finds a newer version with its notes and release page, and says when it checked', async () => {
    const { d, source } = await setup();
    source.releases.stable = { version: '1.5.0', notes: NOTES };
    const before = Date.now();
    const status = (await d.mutate('settings.updates.check')).result!.data as {
      version: string;
      lastCheckedAt: number;
      available: { version: string; notes: string[]; url: string };
    };
    expect(status.version).toBe('1.4.0');
    expect(status.lastCheckedAt).toBeGreaterThanOrEqual(before);
    expect(status.available).toEqual({
      version: '1.5.0',
      notes: ['Faster app installs', 'Live usage', 'One', 'Two', 'Three'],
      url: 'https://github.com/haribrothers/hlabs/releases/tag/v1.5.0',
    });
    expect((await d.query('settings.updates.get')).result!.data).toEqual(status);
    expect(getSetting(d.services!.db, 'connections').updateCheck?.lastContactAt).toBe(status.lastCheckedAt);
  });

  it('up to date: nothing available', async () => {
    const { d, source } = await setup();
    source.releases.stable = { version: '1.4.0' };
    const status = (await d.mutate('settings.updates.check')).result!.data as { available: unknown };
    expect(status.available).toBeNull();
  });

  it('checks the chosen channel and refreshes the store index', async () => {
    const { d, source } = await setup();
    const s = d.services!;
    setSetting(s.db, 'updates', { ...getSetting(s.db, 'updates'), channel: 'beta' });
    source.releases.beta = { version: '1.5.0-beta.1' };
    const sync = vi.spyOn(s.catalog, 'syncBuiltin');
    const status = (await d.mutate('settings.updates.check')).result!.data as { available: { version: string } };
    expect(source.calls).toEqual(['beta']);
    expect(status.available.version).toBe('1.5.0-beta.1');
    expect(sync).toHaveBeenCalledOnce();
  });

  it('offline: UPDATE_CHECK_FAILED, and the previous result stays', async () => {
    const { d, source } = await setup();
    source.releases.stable = { version: '1.5.0' };
    const first = (await d.mutate('settings.updates.check')).result!.data;
    source.offline = true;
    expect((await d.mutate('settings.updates.check')).error?.data.hlabsCode).toBe('UPDATE_CHECK_FAILED');
    expect((await d.query('settings.updates.get')).result!.data).toEqual(first);
  });

  it('announces each newer version once with update.available', async () => {
    const { d, source, available } = await setup();
    source.releases.stable = { version: '1.5.0' };
    await d.mutate('settings.updates.check');
    await d.mutate('settings.updates.check');
    expect(available().map((e) => e.data)).toEqual([{ version: '1.5.0', channel: 'stable' }]);
    source.releases.stable = { version: '1.6.0' };
    await d.mutate('settings.updates.check');
    expect(available()).toHaveLength(2);
  });

  it('is for admins', async () => {
    const { d } = await setup();
    const anu = await memberSession(d);
    expect((await anu.query('settings.updates.get')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });

  it('checks by itself every 6 hours', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    vi.useFakeTimers();
    const source = new FakeUpdateSource();
    source.releases.stable = { version: '9.0.0' };
    const updates = new HlabsUpdates({
      db: d.services!.db,
      bus: new EventBus(),
      logger: silentLogger(),
      source,
      version: '1.0.0',
      syncStore: () => {},
    });
    updates.start();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS - 1);
    expect(source.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.calls).toEqual(['stable']);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(source.calls).toHaveLength(2);
    updates.stop();
  });

  it('compares versions as semver, a release above its pre-releases', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('1.5.0-beta.2', '1.5.0-beta.10')).toBeLessThan(0);
    expect(compareVersions('1.5.0', '1.5.0-beta.10')).toBeGreaterThan(0);
    expect(compareVersions('1.4.0', '1.5.0-beta.1')).toBeLessThan(0);
  });

  it('takes at most five bullets from the notes', () => {
    expect(noteBullets(NOTES)).toHaveLength(5);
    expect(noteBullets('No bullets here')).toEqual([]);
  });
});
