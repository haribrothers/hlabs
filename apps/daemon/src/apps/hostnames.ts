// App addresses (US-STORE-09): `<hostname>.<dashboard name>.local`, never a reserved name or one already in use.
import { apps, getSetting, type HlabsDb } from '@hlabs/db';
import { RESERVED_APP_HOSTNAMES } from '@hlabs/shared';

/** Addresses an app can't take (US-STORE-09): reserved ones, the dashboard's name and every installed app's. */
export function takenHostnames(db: HlabsDb): string[] {
  const own = getSetting(db, 'hostname');
  const installed = db
    .select({ hostname: apps.hostname })
    .from(apps)
    .all()
    .map((a) => a.hostname);
  return [...new Set([...RESERVED_APP_HOSTNAMES, own, ...installed])];
}
