// Data for the widgets that no other query serves: a member's "My files" and "Shared with you" (US-HOME-12), an
// admin's "App status" and "Updates" (US-HOME-19), and apps' own widgets (US-HOME-20). Each names a few apps with their
// icons for the widget's footer (the Phase 7 · Widgets designs).
import { apps, getSetting, type HlabsDb } from '@hlabs/db';
import { inArray } from 'drizzle-orm';
import { managingAdminName } from '../account/account';
import { appSummary } from '../apps/list';
import { homeFolderBytes } from '../storage/home-folder';
import type { AppWidgets } from './app-widgets';
import { visibleAppIds, widgetAllowed } from './layout';

type Who = { id: string; username: string; role: 'admin' | 'member' };
type WidgetData = { status: 'ok' | 'app_not_running' | 'error' | 'needs_key'; data?: unknown; updatedAt: number };
type AppRow = typeof apps.$inferSelect;
/** An app as a widget names it: id, name and icon. */
type NamedApp = { id: string; name: string; icon: ReturnType<typeof appSummary>['icon'] };

/** At most this many apps are named in a widget. */
export const NAMED_APPS = 4;

const RUNNING = new Set(['running']);
/** States that mean an app needs looking at, for "App status". */
const ATTENTION = new Set(['error', 'install_failed', 'update_failed']);

export async function widgetData(
  deps: { db: HlabsDb; appWidgets: AppWidgets; pendingUpdates: () => NamedApp[] },
  who: Who,
  widgetIds: readonly string[],
  now = Date.now(),
) {
  const { db } = deps;
  const out: Record<string, WidgetData> = {};
  const named = (app: AppRow) => {
    const { id, name, icon } = appSummary(db, app);
    return { id, name, icon };
  };
  const allowed = widgetAllowed(db, who);
  for (const id of new Set(widgetIds)) {
    // A person's own summaries are always theirs to read; anything else only if it may be on their Home.
    if (id !== 'my-files' && id !== 'shared-apps' && !allowed(id)) continue;
    if (id === 'app-status') {
      const all = db.select().from(apps).all();
      const attention = all.filter((a) => ATTENTION.has(a.state));
      const stopped = all.filter((a) => a.state === 'stopped');
      out[id] = {
        status: 'ok',
        data: {
          running: all.filter((a) => RUNNING.has(a.state)).length,
          stopped: stopped.length,
          attention: attention.length,
          // The ones to name: those needing attention first.
          notRunning: [...attention, ...stopped].slice(0, NAMED_APPS).map((a) => ({ ...named(a), state: a.state })),
        },
        updatedAt: now,
      };
      continue;
    }
    if (id === 'updates') {
      const pending = deps.pendingUpdates();
      out[id] = { status: 'ok', data: { count: pending.length, apps: pending.slice(0, NAMED_APPS) }, updatedAt: now };
      continue;
    }
    const app = await deps.appWidgets.data(id);
    if (app) {
      out[id] = app;
      continue;
    }
    if (id === 'my-files') {
      // The last photo backup from the phone needs Immich's own API; until hlabs reads it, the line stays hidden.
      out[id] = {
        status: 'ok',
        data: { bytes: homeFolderBytes(db, who.username, now), lastPhotoBackupAt: null },
        updatedAt: now,
      };
    } else if (id === 'shared-apps') {
      const ids = visibleAppIds(db, who);
      const shared = ids.length ? db.select().from(apps).where(inArray(apps.id, ids)).all() : [];
      out[id] = {
        status: 'ok',
        data: {
          total: shared.length,
          running: shared.filter((a) => RUNNING.has(a.state)).length,
          apps: shared.slice(0, NAMED_APPS).map(named),
          adminName: managingAdminName(db),
          canInstall: who.role === 'admin' || getSetting(db, 'people').membersCanInstall,
        },
        updatedAt: now,
      };
    }
  }
  return out;
}
