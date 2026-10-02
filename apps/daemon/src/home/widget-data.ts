// Data for the system widgets that no other query serves (US-HOME-12): a member's "My files" and "Shared with you".
import { apps, getSetting, type HlabsDb } from '@hlabs/db';
import { inArray } from 'drizzle-orm';
import { managingAdminName } from '../account/account';
import { homeFolderBytes } from '../storage/home-folder';
import { visibleAppIds } from './layout';

type Who = { id: string; username: string; role: 'admin' | 'member' };
type WidgetData = { status: 'ok' | 'app_not_running' | 'error'; data?: unknown; updatedAt: number };

const RUNNING = new Set(['running']);

export function widgetData(db: HlabsDb, who: Who, widgetIds: readonly string[], now = Date.now()) {
  const out: Record<string, WidgetData> = {};
  for (const id of new Set(widgetIds)) {
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
