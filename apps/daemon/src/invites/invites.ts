// Invite links (09-account-people.md F-ACCT-07, 03-sign-in.md F-AUTH-09). The token is looked up by its hash; the
// token itself sits in the secret store so an admin can copy the same link again while it's pending (US-ACCT-17).
import { hlabsError, type PendingInvite, type Role } from '@hlabs/api';
import { auditLog, inviteAppAccess, invites, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { lanDashboardOrigin } from '../http/dashboard-origins';
import type { SecretStore } from '../platform/secrets';

export const inviteTokenRef = (inviteId: string) => `invite:${inviteId}`;

/** How long a link works (US-ACCT-21). */
export const INVITE_TTL_MS = 7 * 86_400_000;

export const inviteTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

interface Who {
  userId: string;
  ip: string | null;
}

function audit(
  db: HlabsDb,
  who: Who,
  action: string,
  target: string,
  detail: Record<string, unknown> | null,
  now: number,
) {
  db.insert(auditLog)
    .values({ id: ulid(), at: now, userId: who.userId, action, target, detailJson: detail, ip: who.ip })
    .run();
}

/** A pending invite by id, or NOT_FOUND once it's used, revoked or expired. */
function pendingInvite(db: HlabsDb, inviteId: string, now: number) {
  const row = db
    .select()
    .from(invites)
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
    .get();
  if (!row) throw hlabsError('NOT_FOUND');
  return row;
}

/**
 * A one-time link (US-ACCT-21): 32 random bytes, base64url. Only its SHA-256 is used for lookup; the token itself is
 * kept in the secret store so the same link can be copied again while it's pending (US-ACCT-17).
 */
export async function createInvite(
  db: HlabsDb,
  secrets: SecretStore,
  input: { role: Role; displayName?: string; appIds?: string[] },
  who: Who,
  now = Date.now(),
) {
  const appIds = [...new Set(input.appIds ?? [])];
  const token = randomBytes(32).toString('base64url');
  const id = ulid();
  const ref = inviteTokenRef(id);
  await secrets.set(ref, token);
  const expiresAt = now + INVITE_TTL_MS;
  db.transaction((tx) => {
    tx.insert(invites)
      .values({
        id,
        tokenHash: inviteTokenHash(token),
        tokenRef: ref,
        role: input.role,
        displayName: input.displayName?.trim() || null,
        createdBy: who.userId,
        createdAt: now,
        expiresAt,
      })
      .run();
    if (appIds.length)
      tx.insert(inviteAppAccess)
        .values(appIds.map((appId) => ({ inviteId: id, appId })))
        .run();
    audit(tx as unknown as HlabsDb, who, 'invites.create', id, { role: input.role }, now);
  });
  return { inviteId: id, url: inviteUrl(db, token), expiresAt };
}

/** Change a pending invite's name, role or apps (US-ACCT-21, US-ACCT-22); the link stays the same. */
export function updateInvite(
  db: HlabsDb,
  input: { inviteId: string; displayName?: string; role?: Role; appIds?: string[] },
  now = Date.now(),
) {
  pendingInvite(db, input.inviteId, now);
  db.transaction((tx) => {
    const set: Partial<typeof invites.$inferInsert> = {};
    if (input.displayName !== undefined) set.displayName = input.displayName.trim() || null;
    if (input.role !== undefined) set.role = input.role;
    if (Object.keys(set).length) tx.update(invites).set(set).where(eq(invites.id, input.inviteId)).run();
    if (input.appIds !== undefined) {
      tx.delete(inviteAppAccess).where(eq(inviteAppAccess.inviteId, input.inviteId)).run();
      if (input.appIds.length)
        tx.insert(inviteAppAccess)
          .values([...new Set(input.appIds)].map((appId) => ({ inviteId: input.inviteId, appId })))
          .run();
    }
  });
}

/** Stop a pending link working (US-ACCT-17, US-ACCT-21): it's marked revoked and its token is forgotten. */
export async function revokeInvite(db: HlabsDb, secrets: SecretStore, inviteId: string, who: Who, now = Date.now()) {
  const row = pendingInvite(db, inviteId, now);
  db.transaction((tx) => {
    tx.update(invites).set({ revokedAt: now }).where(eq(invites.id, inviteId)).run();
    audit(tx as unknown as HlabsDb, who, 'invites.revoke', inviteId, null, now);
  });
  if (row.tokenRef) await secrets.delete(row.tokenRef);
}

export const inviteUrl = (db: HlabsDb, token: string) => `${lanDashboardOrigin(db)}/invite/${token}`;

/** Unused, unrevoked, unexpired invites, newest first, each with its link (US-ACCT-13, US-ACCT-17). */
export async function listPendingInvites(
  db: HlabsDb,
  secrets: SecretStore,
  now = Date.now(),
): Promise<PendingInvite[]> {
  const rows = db
    .select()
    .from(invites)
    .where(and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
    .orderBy(desc(invites.createdAt))
    .all();
  return Promise.all(
    rows.map(async (i) => {
      const token = i.tokenRef ? await secrets.get(i.tokenRef) : null;
      return {
        id: i.id,
        role: i.role,
        displayName: i.displayName,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        url: token ? inviteUrl(db, token) : null,
      };
    }),
  );
}
