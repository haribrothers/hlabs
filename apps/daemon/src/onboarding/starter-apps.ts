// Starter apps (US-ONB-19): OnbApps' tiles, and installing the ones picked with the manifest's defaults. Each is an
// ordinary install (the apps.install pipeline): generated secrets, folders where the manifest puts them by default
// (the admin's Home on the storage root, or the app's own data), its id as its address.
import { hlabsError } from '@hlabs/api';
import { apps, getSetting, jobs as jobsTable, users, type HlabsDb } from '@hlabs/db';
import { STARTER_APP_IDS } from '@hlabs/shared';
import { and, desc, eq } from 'drizzle-orm';
import { defaultFolder, type MountRequest } from '../apps/folders';
import type { Installer, InstallService } from '../apps/install';
import type { CatalogService } from '../store/catalog';

const STARTERS: readonly string[] = STARTER_APP_IDS;

export interface StarterDeps {
  db: HlabsDb;
  catalog: Pick<CatalogService, 'get'>;
  installer: Pick<InstallService, 'begin'>;
}

/**
 * Queues one install job per app, in the order given; an app already installed (a second press after a reload) gives
 * its install job instead. Only from the apps step.
 */
export async function installStarterApps(deps: StarterDeps, user: Installer, appIds: string[]) {
  const { db } = deps;
  if (getSetting(db, 'onboarding').step !== 'apps') throw hlabsError('ONBOARDING_STEP_INVALID');
  const ids = [...new Set(appIds)];
  const other = ids.find((id) => !STARTERS.includes(id));
  if (other) throw hlabsError('VALIDATION_FAILED', `${other} isn't a starter app`, { appId: other });
  const username = db.select({ username: users.username }).from(users).where(eq(users.id, user.userId)).get()?.username;
  if (!username) throw hlabsError('AUTH_REQUIRED');

  const jobIds: string[] = [];
  for (const appId of ids) {
    if (db.select({ id: apps.id }).from(apps).where(eq(apps.id, appId)).get()) {
      const job = db
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(and(eq(jobsTable.kind, 'app_install'), eq(jobsTable.target, appId)))
        .orderBy(desc(jobsTable.createdAt))
        .get();
      if (job) jobIds.push(job.id);
      continue;
    }
    const entry = deps.catalog.get(appId);
    if (!entry) throw hlabsError('NOT_FOUND', `${appId} isn't in the store`, { appId });
    const mounts: MountRequest[] = entry.manifest.folders.flatMap((folder) => {
      const place = defaultFolder(db, folder, username);
      return place?.storageLocationId
        ? [
            {
              target: folder.key,
              storageLocationId: place.storageLocationId,
              subpath: place.subpath,
              mode: folder.mode,
            },
          ]
        : [];
    });
    const { jobId } = await deps.installer.begin(user, { appId, env: {}, mounts, acceptRisks: false });
    jobIds.push(jobId);
  }
  return { jobIds };
}
