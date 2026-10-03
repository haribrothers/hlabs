// US-STATE-03 · Handle a failed or stuck update (server side): a start that finds the update didn't take (the marker
// names another version, the job didn't settle on its version, a headless switch was undone) writes
// system.update_failed to the audit log and tells every admin with a critical notification, once.
import { auditLog, jobs as jobsTable, notifications } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown } from '../src/boot';
import { pointCurrent, switchBackIfStale } from '../src/updates/headless';
import { UPDATE_FAILED_KIND } from '../src/updates/install';
import { markUpdateFailed, readUpdateMarker, UPDATE_MARKER } from '../src/updates/marker';
import { startDaemon, tempDir, testConfig } from './helpers';

describe('US-STATE-03 · Handle a failed or stuck update', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
  });

  async function start(config: ReturnType<typeof testConfig>, seed?: (db: never) => void) {
    const d = await startDaemon({ config, skipBoot: true });
    closers.push(d.close);
    const s = await d.boot();
    closers.push(() => shutdown(s));
    seed?.(s!.db as never);
    return s!;
  }

  it('the tray rolled back: the old version starts, reports it once and forgets the marker', async () => {
    const config = testConfig({ version: '1.4.0' });
    const marker = join(config.paths.dataDir, UPDATE_MARKER);
    writeFileSync(marker, JSON.stringify({ fromVersion: '1.4.0', toVersion: '1.5.0', startedAt: 1 }));
    const s = await start(config);
    const audit = s.db.select().from(auditLog).where(eq(auditLog.action, 'system.update_failed')).all();
    expect(audit.map((a) => a.detailJson)).toEqual([{ from: '1.4.0', to: '1.5.0' }]);
    const note = s.db.select().from(notifications).where(eq(notifications.kind, UPDATE_FAILED_KIND)).get();
    expect(note).toMatchObject({
      userId: null,
      severity: 'critical',
      title: "The update didn't install",
      body: "hlabs is still on 1.4.0; 1.5.0 didn't start, so nothing changed.",
      actionJson: [{ kind: 'navigate', to: '/settings/updates' }],
    });
    expect(existsSync(marker)).toBe(false);
  });

  it('migrations that failed are named: the failing start notes it in the marker, the next start reports it', async () => {
    const config = testConfig({ version: '1.4.0' });
    writeFileSync(
      join(config.paths.dataDir, UPDATE_MARKER),
      JSON.stringify({ fromVersion: '1.4.0', toVersion: '1.5.0', startedAt: 1 }),
    );
    markUpdateFailed(config.paths.dataDir, 'migration_failed');
    expect(readUpdateMarker(config.paths.dataDir)?.failedReason).toBe('migration_failed');
    const s = await start(config);
    const audit = s.db.select().from(auditLog).where(eq(auditLog.action, 'system.update_failed')).get();
    expect(audit?.detailJson).toEqual({ from: '1.4.0', to: '1.5.0', reason: 'migration_failed' });
  });

  it("an update job that didn't settle on its version fails, reported once even with the marker there", async () => {
    const config = testConfig({ version: '1.4.0' });
    const first = await start(config);
    first.db
      .insert(jobsTable)
      .values({
        id: 'job1',
        kind: 'system_update',
        target: 'hlabs',
        state: 'running',
        payloadJson: { fromVersion: '1.4.0', version: '1.5.0', userId: null },
        createdAt: Date.now(),
      })
      .run();
    for (const close of closers.splice(0)) await close();
    writeFileSync(
      join(config.paths.dataDir, UPDATE_MARKER),
      JSON.stringify({ fromVersion: '1.4.0', toVersion: '1.5.0', startedAt: 1 }),
    );
    const s = await start(config);
    expect(s.db.select().from(jobsTable).where(eq(jobsTable.id, 'job1')).get()).toMatchObject({
      state: 'failed',
      errorCode: 'UPDATE_NOT_APPLIED',
    });
    expect(s.db.select().from(auditLog).where(eq(auditLog.action, 'system.update_failed')).all()).toHaveLength(1);
    expect(s.db.select().from(notifications).where(eq(notifications.kind, UPDATE_FAILED_KIND)).all()).toHaveLength(1);
  });

  it('headless: a switch the start check undid is reported', async () => {
    const root = tempDir('opt-');
    for (const v of ['1.4.0', '1.5.0']) mkdirSync(join(root, v));
    pointCurrent(root, '1.5.0');
    writeFileSync(join(root, 'switch.json'), JSON.stringify({ from: '1.4.0', to: '1.5.0', at: 0 }));
    expect(switchBackIfStale(root, 10 * 60_000)).toBe('switched-back');
    const s = await start(testConfig({ version: '1.4.0', headless: true, installRoot: root }));
    const audit = s.db.select().from(auditLog).where(eq(auditLog.action, 'system.update_failed')).get();
    expect(audit?.detailJson).toEqual({ from: '1.4.0', to: '1.5.0', reason: 'not_ready' });
    expect(existsSync(join(root, 'switched-back.json'))).toBe(false);
  });
});
