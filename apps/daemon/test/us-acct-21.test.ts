// US-ACCT-21 · Create an invite link (server side): one-time token, hash for lookup, token in the secret store.
import { auditLog, inviteAppAccess, invites, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { inviteTokenHash, inviteTokenRef } from '../src/invites/invites';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const DAY = 86_400_000;

describe('US-ACCT-21', () => {
  it('creates a Member invite with no apps: a 7-day link whose token is only stored hashed in SQLite', async () => {
    const d = await daemonWithAdmin(closers);
    const { db, secrets } = d.services!;
    const before = Date.now();
    const made = (await d.mutate('invites.create', { role: 'member' })).result!.data as {
      inviteId: string;
      url: string;
      expiresAt: number;
    };
    const token = made.url.match(/^https:\/\/hlabs\.local\/invite\/([A-Za-z0-9_-]{43})$/)![1]!;
    expect(made.expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(made.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY);

    const row = db.select().from(invites).where(eq(invites.id, made.inviteId)).get()!;
    expect(row).toMatchObject({ role: 'member', tokenHash: inviteTokenHash(token), createdBy: d.userId, usedAt: null });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await secrets.get(inviteTokenRef(made.inviteId))).toBe(token);
    expect(db.select().from(inviteAppAccess).all()).toEqual([]);
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'invites.create')).get()).toMatchObject({
      userId: d.userId,
      target: made.inviteId,
    });

    // Pending in Users with the same link.
    const list = (await d.query('invites.list')).result!.data.invites as Array<Record<string, unknown>>;
    expect(list).toEqual([expect.objectContaining({ id: made.inviteId, url: made.url })]);
  });

  it('saves their name, trimmed; an empty name clears it', async () => {
    const d = await daemonWithAdmin(closers);
    const { inviteId } = (await d.mutate('invites.create', { role: 'member' })).result!.data as { inviteId: string };
    await d.mutate('invites.update', { inviteId, displayName: '  Anu ' });
    const name = () => d.services!.db.select().from(invites).where(eq(invites.id, inviteId)).get()!.displayName;
    expect(name()).toBe('Anu');
    await d.mutate('invites.update', { inviteId, displayName: '' });
    expect(name()).toBeNull();
  });

  it('revoking stops the link: off the list, token forgotten, audited; a revoked invite cannot be changed', async () => {
    const d = await daemonWithAdmin(closers);
    const { secrets, db } = d.services!;
    const { inviteId } = (await d.mutate('invites.create', { role: 'member' })).result!.data as { inviteId: string };
    expect((await d.mutate('invites.revoke', { inviteId })).result!.data).toEqual({ ok: true });
    expect(db.select().from(invites).where(eq(invites.id, inviteId)).get()!.revokedAt).not.toBeNull();
    expect(await secrets.get(inviteTokenRef(inviteId))).toBeNull();
    expect((await d.query('invites.list')).result!.data.invites).toEqual([]);
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'invites.revoke')).get()?.target).toBe(inviteId);
    expect((await d.mutate('invites.update', { inviteId, displayName: 'x' })).error?.data.hlabsCode).toBe('NOT_FOUND');
    expect((await d.mutate('invites.revoke', { inviteId })).error?.data.hlabsCode).toBe('NOT_FOUND');
  });

  it('members cannot create invites', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect((await d.mutate('invites.create', { role: 'member' })).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
