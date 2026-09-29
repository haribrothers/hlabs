// Home layout per person (US-HOME-02, US-HOME-03): the widgets row and the app grid in their saved order.
// Apps no longer installed (or no longer shared with a member) drop out on read; new ones are appended.
import { appAccess, apps, homeLayout, type HlabsDb, type HomeLayoutItem } from '@hlabs/db';
import { eq } from 'drizzle-orm';

/** A new admin's widgets, in order (US-HOME-02). Members get theirs with MemberHome (phase 3). */
export const DEFAULT_ADMIN_WIDGETS = ['live-usage', 'storage', 'remote-access', 'backups'] as const;

/** The apps this person can open: every installed app for an admin, those shared with a member. */
export function visibleAppIds(db: HlabsDb, user: { id: string; role: 'admin' | 'member' }): string[] {
  if (user.role === 'admin') {
    return db
      .select({ id: apps.id })
      .from(apps)
      .orderBy(apps.installedAt)
      .all()
      .map((a) => a.id);
  }
  return db
    .select({ id: apps.id })
    .from(apps)
    .innerJoin(appAccess, eq(appAccess.appId, apps.id))
    .where(eq(appAccess.userId, user.id))
    .orderBy(apps.installedAt)
    .all()
    .map((a) => a.id);
}

export function getLayout(db: HlabsDb, user: { id: string; role: 'admin' | 'member' }) {
  const saved = db.select().from(homeLayout).where(eq(homeLayout.userId, user.id)).get();
  const visible = visibleAppIds(db, user);
  const canOpen = new Set(visible);
  const base: HomeLayoutItem[] = saved
    ? saved.itemsJson
    : user.role === 'admin'
      ? DEFAULT_ADMIN_WIDGETS.map((id) => ({ kind: 'widget' as const, id }))
      : [];
  const items = base.filter((i) => i.kind === 'widget' || canOpen.has(i.id));
  const placed = new Set(items.filter((i) => i.kind === 'app').map((i) => i.id));
  for (const id of visible) if (!placed.has(id)) items.push({ kind: 'app', id });
  return { items, dock: (saved?.dockJson ?? []).filter((id) => canOpen.has(id)) };
}
