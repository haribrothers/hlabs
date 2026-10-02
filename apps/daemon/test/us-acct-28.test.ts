// US-ACCT-28 · Member's account page (server side): account.get gives their Home folder size, counted in the
// background; the security and device procedures work for members as for admins.
import { storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forgetHomeFolderSizes, homeFolderCounted } from '../src/storage/home-folder';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  forgetHomeFolderSizes();
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-28', () => {
  it('account.get: "Member", and the Home folder size once it has been counted', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    const root = tempDir('hlabs-root-');
    db.insert(storageLocations)
      .values({ id: ulid(), kind: 'local', name: 'This computer', path: root, isRoot: true })
      .run();
    const anu = await memberSession(d);
    mkdirSync(join(root, 'users', 'anu'), { recursive: true });
    writeFileSync(join(root, 'users', 'anu', 'a.bin'), Buffer.alloc(4_200));
    const account = async () => (await anu.query('account.get')).result!.data;
    expect(await account()).toMatchObject({ username: 'anu', role: 'member', homeFolderBytes: null });
    await homeFolderCounted(db, 'anu');
    expect((await account()).homeFolderBytes).toBe(4_200);
  });

  it('a member can change their password and see and sign out their own devices', async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    const changed = await anu.mutate('account.changePassword', {
      currentPassword: 'correct horse battery',
      newPassword: 'another long passphrase',
    });
    expect(changed.result?.data).toEqual({ ok: true });
    const sessions = (await anu.query('auth.listSessions')).result!.data.items as Array<{ current: boolean }>;
    expect(sessions.map((s) => s.current)).toEqual([true]);
  });
});
