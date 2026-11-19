// US-BKP-18 · Choose apps or folders and how to restore (server side): what a point holds with sizes; restoring as a
// copy puts items in Home › Restored › <date time> and stops nothing; an app no longer installed can only be copied;
// everything, replaced, brings back the system part too and restarts hlabs.
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const PASSWORD = 'correct horse battery';

describe('US-BKP-18', () => {
  it('a restore point lists each app and Home folder with its size', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden', { name: 'Vaultwarden' });
    t.put('users/hari/Documents/tax.pdf', 'x'.repeat(500));
    const nas = await t.nasDestination();
    const point = await t.backUp();
    const res = t.data<{
      items: Array<{ kind: string; id: string; label: string; sizeBytes: number; installed: boolean }>;
    }>(await t.d.query('backups.getSnapshot', { destinationId: nas.destinationId, snapshotId: point }));
    expect(res.items.map((i) => [i.kind, i.id, i.installed])).toEqual([
      ['app', 'vaultwarden', true],
      ['folder', 'users/anu', true],
      ['folder', 'users/hari', true],
    ]);
    expect(res.items.find((i) => i.id === 'users/hari')).toMatchObject({ label: 'Home › Hari' });
    expect(res.items.find((i) => i.id === 'users/hari')!.sizeBytes).toBeGreaterThanOrEqual(500);
  });

  it('as a copy: into Home › Restored › <date time> › <item>, nothing stopped or replaced', async () => {
    const t = await backupsDaemon(closers);
    const { data } = t.app('vaultwarden', { name: 'Vaultwarden' });
    const nas = await t.nasDestination();
    const point = await t.backUp();
    writeFileSync(join(data, 'db', 'data.sqlite'), 'today');
    const { jobId } = t.data<{ jobId: string }>(
      await t.d.mutate('backups.restore', {
        destinationId: nas.destinationId,
        snapshotId: point,
        scope: { mode: 'copy', apps: ['vaultwarden'], folders: [] },
        password: PASSWORD,
      }),
    );
    expect((await t.s.jobs.settled(jobId))?.state).toBe('succeeded');
    expect(t.appControl.calls).toEqual([]);
    expect(readFileSync(join(data, 'db', 'data.sqlite'), 'utf8')).toBe('today');
    const restored = join(t.root, 'users/hari/Restored');
    const [stamp] = readdirSync(restored);
    expect(stamp).toMatch(/^\d{4}-\d\d-\d\d \d\d-\d\d$/);
    expect(readFileSync(join(restored, stamp!, 'vaultwarden', 'db', 'data.sqlite'), 'utf8')).toBe('vaultwarden data');
    const view = t.data<{ copyFolder: string }>(await t.d.query('backups.getRestore', { jobId }));
    expect(view.copyFolder).toBe(`Home › Restored › ${stamp}`);
  });

  it('an app no longer installed can’t be replaced in place, only copied', async () => {
    const t = await backupsDaemon(closers);
    t.app('immich');
    const nas = await t.nasDestination();
    const point = await t.backUp();
    t.db.delete(apps).where(eq(apps.id, 'immich')).run();
    const items = t.data<{ items: Array<{ id: string; installed: boolean }> }>(
      await t.d.query('backups.getSnapshot', { destinationId: nas.destinationId, snapshotId: point }),
    ).items;
    expect(items.find((i) => i.id === 'immich')?.installed).toBe(false);
    const res = await t.d.mutate('backups.restore', {
      destinationId: nas.destinationId,
      snapshotId: point,
      scope: { mode: 'replace', apps: ['immich'], folders: [] },
      password: PASSWORD,
    });
    expect(res.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { reason: 'notInstalled' } });
  });

  it('nothing chosen is refused; everything replaced brings back the system part and restarts hlabs', async () => {
    let restarted = 0;
    const t = await backupsDaemon(closers, { boot: { restartDaemon: () => void restarted++ } });
    t.app('vaultwarden');
    t.put('users/hari/notes.txt');
    const nas = await t.nasDestination();
    const point = await t.backUp();
    const restore = (scope: { mode: string; apps: string[]; folders: string[] }) =>
      t.d.mutate('backups.restore', { destinationId: nas.destinationId, snapshotId: point, scope, password: PASSWORD });
    expect(t.code(await restore({ mode: 'replace', apps: [], folders: [] }))).toBe('VALIDATION_FAILED');
    rmSync(join(t.s.config.paths.dataDir, 'apps', 'vaultwarden', 'hlabs-app.json'));
    const { jobId } = t.data<{ jobId: string }>(
      await restore({ mode: 'replace', apps: ['vaultwarden'], folders: ['users/anu', 'users/hari'] }),
    );
    expect((await t.s.jobs.settled(jobId))?.state).toBe('succeeded');
    expect(t.data<{ wholeSystem: boolean }>(await t.d.query('backups.getRestore', { jobId })).wholeSystem).toBe(true);
    // The app setup is back now; the database waits for the next start.
    expect(readdirSync(join(t.s.config.paths.dataDir, 'apps', 'vaultwarden'))).toContain('hlabs-app.json');
    expect(readdirSync(t.s.config.paths.dataDir)).toContain('hlabs.db.restored');
    await new Promise((r) => setTimeout(r, 700));
    expect(restarted).toBe(1);
  });
});
