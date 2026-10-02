// US-AUTH-23 · Open an invite link (server side): invites.inspect is public, read-only and says why a link is dead.
import { apps, invites } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Inspect = {
  status: string;
  inviterName: string | null;
  role: string | null;
  appCount: number;
  displayName: string | null;
};

async function setup() {
  const d = await daemonWithAdmin(closers);
  for (const id of ['jellyfin', 'immich'])
    d.services!.db.insert(apps)
      .values({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 })
      .run();
  const invite = async (input: Record<string, unknown>) => {
    const made = (await d.mutate('invites.create', input)).result!.data as { inviteId: string; url: string };
    return { ...made, token: made.url.split('/invite/')[1]! };
  };
  /** Without a session, as someone opening the link. */
  const inspect = async (token: string) => {
    const input = encodeURIComponent(JSON.stringify(token === '' ? {} : { token }));
    const res = await fetch(`${d.url}/trpc/invites.inspect?input=${input}`);
    return ((await res.json()) as { result: { data: Inspect } }).result.data;
  };
  return { d, invite, inspect };
}

describe('US-AUTH-23', () => {
  it('a valid member invite names the inviter and counts the installed apps shared', async () => {
    const { d, invite, inspect } = await setup();
    // An app shared then uninstalled doesn't count.
    const { token } = await invite({ role: 'member', displayName: 'Anu', appIds: ['jellyfin', 'immich', 'gone'] });
    expect(await inspect(token)).toEqual({
      status: 'valid',
      inviterName: 'Hari',
      inviterAvatarColor: null,
      displayName: 'Anu',
      role: 'member',
      appCount: 2,
    });
    // Looking doesn't use it up.
    expect(d.services!.db.select().from(invites).get()!.usedAt).toBeNull();
  });

  it('an admin invite shares no app count', async () => {
    const { invite, inspect } = await setup();
    const { token } = await invite({ role: 'admin', appIds: ['jellyfin'] });
    expect(await inspect(token)).toMatchObject({ status: 'valid', role: 'admin', appCount: 0 });
  });

  it('says revoked, used or expired, without the invite details', async () => {
    const { d, invite, inspect } = await setup();
    const { db } = d.services!;
    const revoked = await invite({ role: 'member' });
    await d.mutate('invites.revoke', { inviteId: revoked.inviteId });
    expect(await inspect(revoked.token)).toMatchObject({ status: 'revoked', inviterName: 'Hari', role: null });

    const used = await invite({ role: 'member', displayName: 'Anu' });
    db.update(invites).set({ usedAt: Date.now() }).where(eq(invites.id, used.inviteId)).run();
    expect(await inspect(used.token)).toMatchObject({ status: 'used', displayName: null });

    const old = await invite({ role: 'member' });
    db.update(invites)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(invites.id, old.inviteId))
      .run();
    expect(await inspect(old.token)).toMatchObject({ status: 'expired', inviterName: 'Hari' });
  });

  it('an unknown token looks expired, with no inviter', async () => {
    const { inspect } = await setup();
    expect(await inspect('nope')).toEqual({
      status: 'expired',
      inviterName: null,
      inviterAvatarColor: null,
      displayName: null,
      role: null,
      appCount: 0,
    });
  });
});
