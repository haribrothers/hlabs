// App updates for Settings › Updates (US-SYS-25): every installed app whose store listing has a newer version, with
// that version's release notes for "What's new", and the updates that rolled back (US-STORE-17) until dismissed.
import type { StoreUpdates } from '@hlabs/api';
import { apps, getSetting, type HlabsDb } from '@hlabs/db';
import { z } from 'zod';
import { appSummary, catalogRow } from '../apps/list';
import type { UpdateService } from '../apps/update';

const notesOf = z.object({ releaseNotes: z.string().optional() });

/** Apps being installed or removed have nothing to update yet. */
const SETTLED = (state: string) => state !== 'installing' && state !== 'install_failed' && state !== 'uninstalling';

export function listAppUpdates(db: HlabsDb, updates: Pick<UpdateService, 'rolledBack'>): StoreUpdates {
  const installed = db.select().from(apps).all();
  const pending = installed.flatMap((app) => {
    const row = catalogRow(db, app);
    if (!row || row.version === app.version || !SETTLED(app.state)) return [];
    const { name, icon, state } = appSummary(db, app);
    const notes = notesOf.safeParse(row.manifestJson);
    return [
      {
        appId: app.id,
        name,
        icon,
        state,
        fromVersion: app.version,
        toVersion: row.version,
        releaseNotes: (notes.success && notes.data.releaseNotes?.trim()) || null,
      },
    ];
  });
  const rolledBack = installed.flatMap((app) => {
    const r = updates.rolledBack(app.id);
    return r
      ? [
          {
            appId: app.id,
            name: appSummary(db, app).name,
            fromVersion: r.fromVersion,
            toVersion: r.toVersion,
            restored: r.restored,
          },
        ]
      : [];
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    pending: pending.sort(byName),
    rolledBack: rolledBack.sort(byName),
    lastCheckedAt: getSetting(db, 'updates').lastCheckedAt,
  };
}
