// Installed apps for the Home stories (US-HOME-16…22): catalog rows with a full manifest, optionally with a widget whose
// endpoint a local HTTP server answers on the app's loopback port (D-086).
import { apps, catalogApps, type HlabsDb } from '@hlabs/db';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface WidgetDecl {
  id: string;
  name: string;
  template: 'stat' | 'twoStat' | 'list';
  path: string;
  fields: Record<string, unknown>;
  auth?: { header: string; prefix?: string; help: string };
  refresh?: number;
}

let order = 0;

export function manifestFor(id: string, name: string, widgets: WidgetDecl[] = []) {
  return {
    schema: 1,
    id,
    name,
    version: '1.0.0',
    tagline: `${name} for tests`,
    description: 'A test app.',
    category: 'other',
    developer: { name: 'Tests' },
    platforms: ['linux/amd64', 'linux/arm64'],
    web: { service: 'web', port: 8080 },
    widgets: widgets.map((w) => ({
      id: w.id,
      name: w.name,
      template: w.template,
      endpoint: { service: 'web', path: w.path },
      refresh: w.refresh ?? 60,
      fields: w.fields,
      ...(w.auth ? { auth: w.auth } : {}),
    })),
  };
}

/** Puts an installed app in the database. `port` is its app port; its web service is on port + 1000. */
export function installApp(
  db: HlabsDb,
  id: string,
  name: string,
  opts: { widgets?: WidgetDecl[]; port?: number; state?: 'running' | 'stopped' | 'error' } = {},
) {
  const at = ++order;
  db.insert(catalogApps)
    .values({
      sourceId: 'builtin',
      appId: id,
      version: '1.0.0',
      manifestJson: manifestFor(id, name, opts.widgets),
      updatedAt: 1,
      firstSeenAt: 1,
    })
    .onConflictDoUpdate({
      target: [catalogApps.sourceId, catalogApps.appId],
      set: { manifestJson: manifestFor(id, name, opts.widgets) },
    })
    .run();
  db.insert(apps)
    .values({
      id,
      sourceId: 'builtin',
      version: '1.0.0',
      state: opts.state ?? 'running',
      hostname: id,
      portFallback: opts.port ?? 12000 + at,
      installedAt: at,
      updatedAt: at,
    })
    .run();
}

/** An app's web service: answers widget endpoints; returns its app port (listening port − 1000). */
export async function appServer(
  handle: (req: IncomingMessage) => { status?: number; body?: unknown; delayMs?: number },
  closers: Array<() => Promise<void>>,
): Promise<{ port: number; requests: IncomingMessage[] }> {
  const requests: IncomingMessage[] = [];
  const server: Server = createServer((req, res) => {
    requests.push(req);
    const r = handle(req);
    setTimeout(() => {
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.body ?? {}));
    }, r.delayMs ?? 0);
  });
  // The loopback port must be ≥ 1000 above an app port; any free port above 2000 will do.
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  closers.push(() => new Promise((ok) => server.close(() => ok())));
  return { port: (server.address() as AddressInfo).port - 1000, requests };
}
