// Home layout per person (US-HOME-02, 03, 16…19, 22): the widgets row and the app grid in their saved order, the apps
// they took off Home, and their pinned Dock apps. Apps no longer installed (or no longer shared with a member) drop out
// on read; new ones are appended unless taken off Home; widgets they may no longer have drop out too.
import { AppManifest, type AppWidget } from '@hlabs/app-manifest';
import { appAccess, apps, getSetting, homeLayout, users, type HlabsDb, type HomeLayoutItem } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { catalogRow } from '../apps/catalog-row';

/** A new admin's widgets, in order (US-HOME-02). */
export const DEFAULT_ADMIN_WIDGETS = ['live-usage', 'storage', 'remote-access', 'backups'] as const;
/** A new member's widgets (US-HOME-11, US-HOME-12); live usage only shows while it's allowed. */
export const DEFAULT_MEMBER_WIDGETS = ['my-files', 'shared-apps', 'live-usage'] as const;
/** The widgets about running the server, never on a member's Home (US-HOME-11). */
export const ADMIN_ONLY_WIDGETS: ReadonlySet<string> = new Set([
  'storage',
  'remote-access',
  'backups',
  'app-status',
  'updates',
]);
/** hlabs's own widgets in the picker's order (US-HOME-19). */
export const SYSTEM_WIDGETS = {
  admin: ['live-usage', 'storage', 'remote-access', 'backups', 'app-status', 'updates'],
  member: ['my-files', 'shared-apps', 'live-usage'],
} as const;
export const SYSTEM_WIDGET_NAMES: Record<string, string> = {
  'live-usage': 'Live usage',
  storage: 'Storage',
  'remote-access': 'Remote access',
  backups: 'Backups',
  'app-status': 'App status',
  updates: 'Updates',
  'my-files': 'My files',
  'shared-apps': 'Shared apps',
};
/** Up to four widgets fit on Home (US-HOME-19). */
export const MAX_WIDGETS = 4;
/** Up to eight pinned apps in the Dock (US-HOME-22, D-054). */
export const MAX_DOCK = 8;

type Who = { id: string; role: 'admin' | 'member' };

/** Live usage for a member needs both "See live usage" for members and their own switch (D-029, 07 §7.4). */
export function memberSeesUsage(db: HlabsDb, userId: string): boolean {
  const user = db.select({ canSeeUsage: users.canSeeUsage }).from(users).where(eq(users.id, userId)).get();
  return getSetting(db, 'people').membersCanSeeUsage && (user?.canSeeUsage ?? false);
}

/** The apps this person can open: every installed app for an admin, those shared with a member. */
export function visibleAppIds(db: HlabsDb, user: Who): string[] {
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

/** `app:<appId>:<widgetId>` → its parts. */
export function parseAppWidgetId(id: string): { appId: string; widgetId: string } | null {
  const m = /^app:([a-z0-9-]+):([a-z][a-z0-9-]*)$/.exec(id);
  return m ? { appId: m[1]!, widgetId: m[2]! } : null;
}

/** An installed app's widgets from its manifest, with its name. */
export function appWidgetsOf(db: HlabsDb, appId: string): { name: string; widgets: AppWidget[] } | null {
  const app = db.select().from(apps).where(eq(apps.id, appId)).get();
  if (!app) return null;
  const parsed = AppManifest.safeParse(catalogRow(db, app)?.manifestJson);
  return parsed.success ? { name: parsed.data.name, widgets: parsed.data.widgets } : null;
}

/** The widgets this person may have on Home: hlabs's own for their role, and the widgets of apps they can open. */
export function widgetAllowed(db: HlabsDb, user: Who) {
  const usage = user.role === 'member' ? memberSeesUsage(db, user.id) : true;
  const visible = new Set(visibleAppIds(db, user));
  const system = new Set<string>(SYSTEM_WIDGETS[user.role]);
  return (id: string) => {
    if (system.has(id)) return id !== 'live-usage' || usage;
    const ref = parseAppWidgetId(id);
    if (!ref || !visible.has(ref.appId)) return false;
    const widget = appWidgetsOf(db, ref.appId)?.widgets.find((w) => w.id === ref.widgetId);
    // A widget read with an admin's key shows everyone's figures: admins only (D-157).
    return Boolean(widget) && (user.role === 'admin' || !widget!.auth);
  };
}

/** Saved items (or a new person's defaults), kept to what's allowed now: widgets first-four, apps visible. */
function normalise(
  db: HlabsDb,
  user: Who,
  items: readonly HomeLayoutItem[],
  hiddenIn: readonly string[],
): { items: HomeLayoutItem[]; hidden: string[] } {
  const visible = visibleAppIds(db, user);
  const canOpen = new Set(visible);
  const allowed = widgetAllowed(db, user);
  const seen = new Set<string>();
  const out: HomeLayoutItem[] = [];
  let widgets = 0;
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.kind === 'widget') {
      if (widgets >= MAX_WIDGETS || !allowed(item.id)) continue;
      widgets++;
    } else if (!canOpen.has(item.id)) continue;
    out.push({ kind: item.kind, id: item.id });
  }
  const placed = new Set(out.filter((i) => i.kind === 'app').map((i) => i.id));
  const hidden = [...new Set(hiddenIn)].filter((id) => canOpen.has(id) && !placed.has(id));
  const hide = new Set(hidden);
  for (const id of visible) if (!placed.has(id) && !hide.has(id)) out.push({ kind: 'app', id });
  return { items: out, hidden };
}

const defaults = (user: Who): HomeLayoutItem[] =>
  (user.role === 'admin' ? DEFAULT_ADMIN_WIDGETS : DEFAULT_MEMBER_WIDGETS).map((id) => ({ kind: 'widget', id }));

export function getLayout(db: HlabsDb, user: Who) {
  const saved = db.select().from(homeLayout).where(eq(homeLayout.userId, user.id)).get();
  const { items, hidden } = normalise(db, user, saved ? saved.itemsJson : defaults(user), saved?.hiddenJson ?? []);
  const canOpen = new Set(visibleAppIds(db, user));
  return { items, dock: (saved?.dockJson ?? []).filter((id) => canOpen.has(id)).slice(0, MAX_DOCK), hidden };
}

/**
 * Saves Home after edit mode (US-HOME-16…19): the order given, without what this person can't have, with apps they
 * didn't place (installed meanwhile) appended unless they took them off Home.
 */
export function saveLayout(db: HlabsDb, user: Who, input: { items: HomeLayoutItem[]; hidden?: string[] }) {
  const saved = db.select().from(homeLayout).where(eq(homeLayout.userId, user.id)).get();
  const result = normalise(db, user, input.items, input.hidden ?? saved?.hiddenJson ?? []);
  db.insert(homeLayout)
    .values({ userId: user.id, itemsJson: result.items, hiddenJson: result.hidden })
    .onConflictDoUpdate({ target: homeLayout.userId, set: { itemsJson: result.items, hiddenJson: result.hidden } })
    .run();
  return result;
}

/** Pins apps to the Dock in this order (US-HOME-22): only apps this person can open, at most eight. */
export function saveDock(db: HlabsDb, user: Who, appIds: readonly string[]) {
  const canOpen = new Set(visibleAppIds(db, user));
  const dock = [...new Set(appIds)].filter((id) => canOpen.has(id)).slice(0, MAX_DOCK);
  const saved = db.select().from(homeLayout).where(eq(homeLayout.userId, user.id)).get();
  db.insert(homeLayout)
    .values({ userId: user.id, itemsJson: saved?.itemsJson ?? defaults(user), dockJson: dock })
    .onConflictDoUpdate({ target: homeLayout.userId, set: { dockJson: dock } })
    .run();
  return { dock };
}
