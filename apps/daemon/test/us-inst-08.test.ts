// US-INST-08 · Pause and resume all apps: pause_all stops every app that's up (data untouched) and remembers them;
// a restart keeps them stopped; resume_all starts exactly those again; an install that finishes meanwhile is stopped
// too; both are audited as from the tray.
import { auditLog, getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { trayStatus } from '../src/tray/status';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: { jobId: string } } };

async function withKuma() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId);
  await t.s.reconciled;
  expect(t.s.apps.get('uptime-kuma')?.state).toBe('running');
  return t;
}

describe('US-INST-08 · Pause and resume all apps', () => {
  it('pausing stops every running app, remembers them and says paused', async () => {
    const t = await withKuma();
    const jobId = t.s.jobs.start('pause_all', { payload: { via: 'tray' } });
    await t.s.jobs.settled(jobId);

    expect(t.s.apps.get('uptime-kuma')?.state).toBe('stopped');
    expect(getSetting(t.s.db, 'paused')).toMatchObject({ appIds: ['uptime-kuma'] });
    expect(await trayStatus(t.s)).toMatchObject({ state: 'paused', paused: true, appsRunning: 0 });
    const audit = t.s.db
      .select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'system.pause');
    expect(audit).toMatchObject({ userId: null, detailJson: { via: 'tray', appIds: ['uptime-kuma'] } });
  });

  it('a restart keeps paused apps stopped', async () => {
    const t = await withKuma();
    await t.s.jobs.settled(t.s.jobs.start('pause_all', { payload: { via: 'tray' } }));
    await t.s.apps.reconcile();
    expect(t.s.apps.get('uptime-kuma')?.state).toBe('stopped');
  });

  it('resuming starts the apps that were running and clears the pause', async () => {
    const t = await withKuma();
    await t.s.jobs.settled(t.s.jobs.start('pause_all', { payload: { via: 'tray' } }));
    await t.s.jobs.settled(t.s.jobs.start('resume_all', { payload: { via: 'tray' } }));

    expect(t.s.apps.get('uptime-kuma')?.state).toBe('running');
    expect(getSetting(t.s.db, 'paused')).toBeNull();
    expect(await trayStatus(t.s)).toMatchObject({ state: 'running', paused: false });
    const audit = t.s.db
      .select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'system.resume');
    expect(audit).toMatchObject({ detailJson: { via: 'tray', appIds: ['uptime-kuma'] } });
  });

  it("doesn't start an app on resume that was stopped before the pause", async () => {
    const t = await withKuma();
    await t.s.apps.stop('uptime-kuma');
    await t.s.jobs.settled(t.s.jobs.start('pause_all', { payload: { via: 'tray' } }));
    expect(getSetting(t.s.db, 'paused')).toMatchObject({ appIds: [] });
    await t.s.jobs.settled(t.s.jobs.start('resume_all', { payload: { via: 'tray' } }));
    expect(t.s.apps.get('uptime-kuma')?.state).toBe('stopped');
  });

  it('an install that finishes while paused is stopped with the others, and resumed with them', async () => {
    const t = await installDaemon(closers);
    await t.s.reconciled;
    await t.s.jobs.settled(t.s.jobs.start('pause_all', { payload: { via: 'tray' } }));
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.s.apps.get('uptime-kuma')?.state).toBe('stopped');
    expect(getSetting(t.s.db, 'paused')).toMatchObject({ appIds: ['uptime-kuma'] });
    await t.s.jobs.settled(t.s.jobs.start('resume_all', { payload: { via: 'tray' } }));
    expect(t.s.apps.get('uptime-kuma')?.state).toBe('running');
  });
});
