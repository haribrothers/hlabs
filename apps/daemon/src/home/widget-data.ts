// Data for the widgets that no other query serves: a member's "My files" and "Shared with you" (US-HOME-12), an
// admin's "App status" and "Updates" (US-HOME-19), and apps' own widgets (US-HOME-20).
import { apps, getSetting, type HlabsDb } from '@hlabs/db';
import { inArray } from 'drizzle-orm';
import { managingAdminName } from '../account/account';
import { homeFolderBytes } from '../storage/home-folder';
import type { AppWidgets } from './app-widgets';
import { visibleAppIds, widgetAllowed } from './layout';

type Who = { id: string; username: string; role: 'admin' | 'member' };
type WidgetData = { status: 'ok' | 'app_not_running' | 'error' | 'needs_key'; data?: unknown; updatedAt: number };

const RUNNING = new Set(['running']);
/** States that mean an app needs looking at, for "App status". */
const ATTENTION = new Set(['error', 'install_failed', 'update_failed']);

export async function widgetData(
  deps: { db: HlabsDb; appWidgets: AppWidgets; pendingUpdates: () => number },
  who: Who,
  widgetIds: readonly string[],
  now = Date.now(),
) {
  const { db } = deps;
  const out: Record<string, WidgetData> = {};
  const allowed = widgetAllowed(db, who);
  for (const id of new Set(widgetIds)) {
    // A person's own summaries are always theirs to read; anything else only if it may be on their Home.
    if (id !== 'my-files' && id !== 'shared-apps' && !allowed(id)) continue;
    if (id === 'app-status') {
      const states = db.select({ state: apps.state }).from(apps).all();
      out[id] = {
        status: 'ok',
        data: {
          running: states.filter((s) => RUNNING.has(s.state)).length,
          stopped: states.filter((s) => s.state === 'stopped').length,
          attention: states.filter((s) => ATTENTION.has(s.state)).length,
        },
        updatedAt: now,
      };
      continue;
    }
    if (id === 'updates') {
      out[id] = { status: 'ok', data: { count: deps.pendingUpdates() }, updatedAt: now };
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
      const states = ids.length ? db.select({ state: apps.state }).from(apps).where(inArray(apps.id, ids)).all() : [];
      out[id] = {
        status: 'ok',
        data: {
          total: states.length,
          running: states.filter((s) => RUNNING.has(s.state)).length,
          adminName: managingAdminName(db),
          canInstall: who.role === 'admin' || getSetting(db, 'people').membersCanInstall,
        },
        updatedAt: now,
      };
    }
  }
  return out;
}
