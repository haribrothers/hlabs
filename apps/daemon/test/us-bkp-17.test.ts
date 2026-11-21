// US-BKP-17 · Start a restore and pick a restore point (server side): one point per run, newest first, with the
// data changed; older ones kept for a week or a month labelled so; an unreachable destination says so.
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Points = { points: Array<{ id: string; time: number; kind: string; bytesChanged: number | null }> };

describe('US-BKP-17', () => {
  it('restore points: one per run, newest first, with what changed; past the daily ones, Weekly then Monthly', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    const first = await t.backUp();
    const second = await t.backUp();
    const { points } = t.data<Points>(await t.d.query('backups.listSnapshots', { destinationId: nas.destinationId }));
    expect(points.map((p) => p.id)).toEqual([second, first]);
    expect(points[0]!.bytesChanged).toBeGreaterThan(0);
    expect(points.every((p) => p.kind === 'daily')).toBe(true);
    // Kept for longer than the daily points: labelled by how they're kept.
    t.data(await t.d.mutate('backups.plan.update', { retention: { daily: 1, weekly: 0, monthly: 2 } }));
    const repo = t.restic.repos.get(nas.repo)!;
    for (const s of repo.snapshots.filter((x) => x.tags.includes(`run:${first}`))) s.time -= 40 * 86_400_000;
    const later = t.data<Points>(await t.d.query('backups.listSnapshots', { destinationId: nas.destinationId }));
    expect(later.points.map((p) => p.kind)).toEqual(['daily', 'monthly']);
  });

  it('a destination that can’t be reached: BACKUP_DEST_UNREACHABLE', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    await t.backUp();
    t.restic.unreachable.add(nas.repo);
    expect(t.code(await t.d.query('backups.listSnapshots', { destinationId: nas.destinationId }))).toBe(
      'BACKUP_DEST_UNREACHABLE',
    );
  });
});
