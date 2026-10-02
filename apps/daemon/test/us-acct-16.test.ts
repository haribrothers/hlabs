// US-ACCT-16 · Delete someone (server side).
import {
  appAccess,
  apps,
  auditLog,
  homeLayout,
  jobs,
  recoveryCodes,
  sessions,
  storageLocations,
  trashItems,
  users,
  userTotp,
} from '@hlabs/db';
import { keptHomeFolderName, ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forgetHomeFolderSizes } from '../src/storage/home-folder';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  forgetHomeFolderSizes();
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const d = await daemonWithAdmin(closers);
  const { db } = d.services!;
  const root = tempDir('hlabs-root-');
  db.insert(storageLocations)
    .values({ id: ulid(), kind: 'local', name: 'This computer', path: root, isRoot: true })
    .run();
  db.insert(apps)
    .values({ id: 'immich', version: '1', state: 'running', hostname: 'immich', installedAt: 1, updatedAt: 1 })
    .run();
  const anu = await memberSession(d, { appIds: ['immich'] });
  db.insert(userTotp)
    .values({ userId: anu.userId, secretRef: `totp:${anu.userId}`, enabledAt: 1 })
    .run();
  db.insert(recoveryCodes).values({ id: ulid(), userId: anu.userId, codeHash: 'h' }).run();
  db.insert(homeLayout).values({ userId: anu.userId, itemsJson: [], dockJson: [] }).run();
  writeFileSync(join(root, 'users', 'anu', 'notes.txt'), 'hello');
  return { d, db, root, anu };
}

describe('US-ACCT-16', () => {
  it('without the checkbox: everything of theirs goes but the Home folder, kept for admins under a new name', async () => {
    const { d, db, root, anu } = await setup();
    const res = await d.mutate('users.delete', { userId: anu.userId });
    expect(res.result?.data).toEqual({ jobId: null });
    expect(db.select().from(users).where(eq(users.id, anu.userId)).get()).toBeUndefined();
    for (const table of [sessions, userTotp, recoveryCodes, appAccess, homeLayout])
      expect(db.select().from(table).where(eq(table.userId, anu.userId)).all()).toEqual([]);
    // Renamed out of the way (D-101), so the username can be used again with an empty Home.
    expect(existsSync(join(root, 'users', 'anu'))).toBe(false);
    expect(existsSync(join(root, 'users', keptHomeFolderName('anu', Date.now()), 'notes.txt'))).toBe(true);
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'users.delete')).get()).toMatchObject({
      userId: d.userId,
      target: anu.userId,
    });
    // Their browser is signed out.
    expect((await anu.query('auth.me')).status).toBe(401);
  });

  it('with the checkbox: their Home folder goes to the trash as a job, kept for the admin who deleted them', async () => {
    const { d, db, root, anu } = await setup();
    const { jobId } = (await d.mutate('users.delete', { userId: anu.userId, deleteHomeFolder: true })).result!.data as {
      jobId: string;
    };
    await expect
      .poll(() => db.select().from(jobs).where(eq(jobs.id, jobId)).get()?.state, { timeout: 5_000 })
      .toBe('succeeded');
    expect(existsSync(join(root, 'users', 'anu'))).toBe(false);
    expect(readdirSync(join(root, '.trash')).some((n) => n.endsWith('-anu'))).toBe(true);
    expect(db.select().from(trashItems).all()).toEqual([
      expect.objectContaining({ ownerUserId: d.userId, originalPath: 'users/anu', size: 5 }),
    ]);
  });

  it('refuses the last enabled admin', async () => {
    const { d } = await setup();
    expect((await d.mutate('users.delete', { userId: d.userId })).error?.data.hlabsCode).toBe('LAST_ADMIN');
  });

  it('the username can be used again by a later invite, and that person starts with an empty Home', async () => {
    const { d, root, anu } = await setup();
    await d.mutate('users.delete', { userId: anu.userId });
    const again = await memberSession(d, { username: 'anu' });
    expect(again.userId).not.toBe(anu.userId);
    expect(readdirSync(join(root, 'users', 'anu'))).toEqual([]);
  });

  it('a second deletion on the same day gets its own folder', async () => {
    const { d, root, anu } = await setup();
    await d.mutate('users.delete', { userId: anu.userId });
    const again = await memberSession(d, { username: 'anu' });
    writeFileSync(join(root, 'users', 'anu', 'second.txt'), 'x');
    await d.mutate('users.delete', { userId: again.userId });
    const kept = keptHomeFolderName('anu', Date.now());
    expect(existsSync(join(root, 'users', kept, 'notes.txt'))).toBe(true);
    expect(existsSync(join(root, 'users', `${kept}-2`, 'second.txt'))).toBe(true);
  });
});
