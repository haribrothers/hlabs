// An installed app's catalog row: its own source's, else any source's (an app installed before its source changed).
import { catalogApps, type HlabsDb } from '@hlabs/db';
import { and, eq } from 'drizzle-orm';

export function catalogRow(db: HlabsDb, app: { id: string; sourceId: string | null }) {
  return (
    (app.sourceId
      ? db
          .select()
          .from(catalogApps)
          .where(and(eq(catalogApps.sourceId, app.sourceId), eq(catalogApps.appId, app.id)))
          .get()
      : undefined) ?? db.select().from(catalogApps).where(eq(catalogApps.appId, app.id)).get()
  );
}
