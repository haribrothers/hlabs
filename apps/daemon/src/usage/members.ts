// Who sees which usage (US-USE-02, D-029): admins see everything; a member allowed to see live usage (both "See live
// usage" for members and their own switch) sees the host and only the apps shared with them.
import type { UsageSample } from '@hlabs/api';
import { users, type HlabsDb } from '@hlabs/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { DaemonContext } from '../context';
import { memberSeesUsage, visibleAppIds } from '../home/layout';

/** The apps the caller may see usage for; null means all of them (an admin). */
export function usageAppsFor(ctx: DaemonContext): Set<string> | null {
  const id = ctx.identity;
  if (id.kind !== 'user' || id.role === 'admin') return null;
  return new Set(visibleAppIds(ctx.services.db, { id: id.userId, role: id.role }));
}

export function onlyApps(sample: UsageSample, allowed: Set<string> | null): UsageSample {
  return allowed === null ? sample : { ...sample, apps: sample.apps.filter((a) => allowed.has(a.appId)) };
}

/** Members who may see live usage now, each with the apps shared with them. */
export function usageMembers(db: HlabsDb): Array<{ userId: string; apps: Set<string> }> {
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'member'), isNull(users.disabledAt)))
    .all()
    .filter((u) => memberSeesUsage(db, u.id))
    .map((u) => ({ userId: u.id, apps: new Set(visibleAppIds(db, { id: u.id, role: 'member' })) }));
}
