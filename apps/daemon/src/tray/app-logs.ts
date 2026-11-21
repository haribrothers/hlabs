// tray.appLogs (US-INST-25, D-035): one app's recent container logs for `hlabs logs --app <id>`, which follows them by
// asking again with `since`. The tray token may call tray.* only, so this is apps.logs for it.
import { hlabsError, type LogLine } from '@hlabs/api';
import { apps, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { AppLogs } from '../apps/logs';

export async function trayAppLogs(
  deps: { db: HlabsDb; logs: Pick<AppLogs, 'recent'> },
  input: { appId: string; tail?: number; since?: number },
): Promise<{ lines: LogLine[] }> {
  const app = deps.db.select({ id: apps.id }).from(apps).where(eq(apps.id, input.appId)).get();
  if (!app) throw hlabsError('NOT_FOUND');
  return { lines: await deps.logs.recent(input.appId, { tail: input.tail ?? 200, since: input.since }) };
}
