// The web ports (US-SYS-05): which ports hlabs's proxy listens on, the raw ports apps publish (shown so a change
// doesn't clash), and changing them, checked free first.
import { hlabsError } from '@hlabs/api';
import { apps, auditLog, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { z } from 'zod';
import { catalogManifest, catalogRow } from '../apps/list';
import { APP_PORT_MAX, APP_PORT_MIN } from '../apps/ports';

const rawPorts = z.array(
  z.object({ host: z.number(), protocol: z.enum(['tcp', 'udp']).default('tcp'), label: z.string() }).passthrough(),
);

/** The raw ports installed apps publish (DNS for AdGuard Home, SMB…), by app name. */
export function appRawPorts(db: HlabsDb) {
  return db
    .select()
    .from(apps)
    .all()
    .flatMap((app) => {
      const ports = rawPorts.safeParse((catalogRow(db, app)?.manifestJson as { ports?: unknown } | undefined)?.ports);
      const name = catalogManifest(db, app).name ?? app.id;
      return ports.success
        ? ports.data.map((p) => ({ appId: app.id, appName: name, port: p.host, protocol: p.protocol, label: p.label }))
        : [];
    })
    .sort((a, b) => a.port - b.port);
}

/** 443 or 1024–65535 for HTTPS; 80 or 1024–65535 for HTTP; never an app's own port range (12000–13999, D-086). */
function allowed(port: number, usual: number): boolean {
  if (port === usual) return true;
  if (port < 1024 || port > 65535) return false;
  return port < APP_PORT_MIN || port > APP_PORT_MAX + 1000;
}

export async function setWebPorts(
  deps: { db: HlabsDb; portInUse: (port: number) => Promise<boolean>; apply: () => Promise<void> },
  input: { https: number; http: number },
  who: { userId: string; ip: string | null },
  now = Date.now(),
) {
  const { db } = deps;
  if (!allowed(input.https, 443) || !allowed(input.http, 80) || input.https === input.http) {
    throw hlabsError('VALIDATION_FAILED', 'Choose other ports', { https: input.https, http: input.http });
  }
  const current = getSetting(db, 'network').ports;
  const appPorts = new Set(appRawPorts(db).map((p) => p.port));
  // Only the ports that change need checking: hlabs holds the current ones itself.
  for (const port of [input.https, input.http]) {
    if (port === current.https || port === current.http) continue;
    if (appPorts.has(port) || (await deps.portInUse(port)))
      throw hlabsError('NETWORK_PORT_IN_USE', undefined, { port });
  }
  db.transaction((tx) => {
    const inTx = tx as unknown as HlabsDb;
    setSetting(inTx, 'network', { ...getSetting(inTx, 'network'), ports: { https: input.https, http: input.http } });
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: who.userId,
        action: 'network.setPorts',
        target: 'network',
        detailJson: { from: current, to: input },
        ip: who.ip,
      })
      .run();
  });
  await deps.apply();
}
