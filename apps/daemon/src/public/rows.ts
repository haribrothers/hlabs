// Public apps as the API shows them (US-APP-27, US-SYS-44): an app's public address (`apps.get`, `apps.list`) and the
// rows of Settings › Network › Public apps. Read straight from `app_public`, so every view agrees.
import type { AppPublic } from '@hlabs/api';
import { appPublic, users, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';

type Row = typeof appPublic.$inferSelect;

export function toAppPublic(row: Row, byName: string | null): AppPublic {
  return { address: row.address, hostname: row.hostname, access: row.access, since: row.enabledAt, by: byName };
}

/** An app's public address, or null while it's private. */
export function appPublicOf(db: HlabsDb, appId: string): AppPublic | null {
  const row = db
    .select({ row: appPublic, by: users.displayName })
    .from(appPublic)
    .leftJoin(users, eq(users.id, appPublic.enabledBy))
    .where(eq(appPublic.appId, appId))
    .get();
  return row ? toAppPublic(row.row, row.by) : null;
}

/** The public app at a host (`photos.example.com`), or null. */
export function publicRowForHost(db: HlabsDb, host: string): Row | null {
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return db.select().from(appPublic).where(eq(appPublic.hostname, name)).get() ?? null;
}
