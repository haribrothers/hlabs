// US-ACCT-22 · Choose the invitee's role and apps (server side): changes keep the same link.
import { inviteAppAccess, invites } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-22', () => {
  it('role and apps change on the pending invite while its link stays the same', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    const { inviteId, url } = (await d.mutate('invites.create', { role: 'member' })).result!.data as {
      inviteId: string;
      url: string;
    };
    const appsOf = () =>
      db
        .select({ appId: inviteAppAccess.appId })
        .from(inviteAppAccess)
        .where(eq(inviteAppAccess.inviteId, inviteId))
        .all()
        .map((r) => r.appId)
        .sort();

    await d.mutate('invites.update', { inviteId, appIds: ['jellyfin', 'immich', 'jellyfin'] });
    expect(appsOf()).toEqual(['immich', 'jellyfin']);
    await d.mutate('invites.update', { inviteId, appIds: ['immich'] });
    expect(appsOf()).toEqual(['immich']);
    await d.mutate('invites.update', { inviteId, role: 'admin' });
    expect(db.select().from(invites).where(eq(invites.id, inviteId)).get()!.role).toBe('admin');
    // Only the fields sent change.
    expect(appsOf()).toEqual(['immich']);
    await d.mutate('invites.update', { inviteId, displayName: 'Anu' });
    expect(appsOf()).toEqual(['immich']);

    const listed = (await d.query('invites.list')).result!.data.invites as Array<{ url: string; role: string }>;
    expect(listed).toEqual([expect.objectContaining({ url, role: 'admin' })]);
  });
});
