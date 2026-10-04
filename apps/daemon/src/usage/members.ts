// Who sees which usage (US-USE-02, D-029): admins see everything; a member allowed to see live usage (both "See live
// usage" for members and their own switch) sees the host and only the apps shared with them.
import type { UsageSample } from '@hlabs/api';
import { users, type HlabsDb } from '@hlabs/db';
import { and, eq, isNull } from 'drizzle-orm';
import { memberSeesUsage, visibleAppIds } from '../home/layout';

/** Who is asking, as far as usage cares (the request's identity). */
export type UsageViewer = { kind: 'user'; userId: string; role: 'admin' | 'member' } | { kind: string };

/** The apps the caller may see usage for; null means all of them (an admin, or the tray). */
export function usageAppsFor(db: HlabsDb, viewer: UsageViewer): Set<string> | null {
  if (viewer.kind !== 'user' || !('role' in viewer) || viewer.role === 'admin') return null;
  return new Set(visibleAppIds(db, { id: viewer.userId, role: viewer.role }));
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
