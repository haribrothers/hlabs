// Invite links (09-account-people.md F-ACCT-07, 03-sign-in.md F-AUTH-09). The token is looked up by its hash; the
// token itself sits in the secret store so an admin can copy the same link again while it's pending (US-ACCT-17).
import type { PendingInvite } from '@hlabs/api';
import { invites, type HlabsDb } from '@hlabs/db';
import { and, desc, gt, isNull } from 'drizzle-orm';
import { lanDashboardOrigin } from '../http/dashboard-origins';
import type { SecretStore } from '../platform/secrets';

export const inviteTokenRef = (inviteId: string) => `invite:${inviteId}`;

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
