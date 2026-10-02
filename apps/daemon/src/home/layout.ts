// Home layout per person (US-HOME-02, US-HOME-03): the widgets row and the app grid in their saved order.
// Apps no longer installed (or no longer shared with a member) drop out on read; new ones are appended.
import { appAccess, apps, getSetting, homeLayout, users, type HlabsDb, type HomeLayoutItem } from '@hlabs/db';
import { eq } from 'drizzle-orm';

/** A new admin's widgets, in order (US-HOME-02). */
export const DEFAULT_ADMIN_WIDGETS = ['live-usage', 'storage', 'remote-access', 'backups'] as const;
/** A new member's widgets (US-HOME-11, US-HOME-12); live usage only shows while it's allowed. */
export const DEFAULT_MEMBER_WIDGETS = ['my-files', 'shared-apps', 'live-usage'] as const;
/** The widgets about running the server, never on a member's Home (US-HOME-11). */
export const ADMIN_ONLY_WIDGETS: ReadonlySet<string> = new Set(['storage', 'remote-access', 'backups']);

/** Live usage for a member needs both "See live usage" for members and their own switch (D-029, 07 §7.4). */
export function memberSeesUsage(db: HlabsDb, userId: string): boolean {
  const user = db.select({ canSeeUsage: users.canSeeUsage }).from(users).where(eq(users.id, userId)).get();
  return getSetting(db, 'people').membersCanSeeUsage && (user?.canSeeUsage ?? false);
}

/** The widgets a member may have: none of the admin ones, and live usage only while allowed (US-HOME-11). */
function memberWidget(db: HlabsDb, userId: string) {
  const usage = memberSeesUsage(db, userId);
  return (id: string) => !ADMIN_ONLY_WIDGETS.has(id) && (id !== 'live-usage' || usage);
}

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
      : DEFAULT_MEMBER_WIDGETS.map((id) => ({ kind: 'widget' as const, id }));
  const widgetAllowed = user.role === 'admin' ? () => true : memberWidget(db, user.id);
  const items = base.filter((i) => (i.kind === 'widget' ? widgetAllowed(i.id) : canOpen.has(i.id)));
  const placed = new Set(items.filter((i) => i.kind === 'app').map((i) => i.id));
  for (const id of visible) if (!placed.has(id)) items.push({ kind: 'app', id });
  return { items, dock: (saved?.dockJson ?? []).filter((id) => canOpen.has(id)) };
}
