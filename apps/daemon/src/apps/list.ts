// Installed apps as Home shows them (US-HOME-03): name and icon from the app's catalog manifest, state, and the
// addresses it opens at. Admins see every app; members only those shared with them.
import { apps, catalogApps, getSetting, type HlabsDb } from '@hlabs/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { visibleAppIds } from '../home/layout';

/** The few manifest fields Home needs; the full schema lives in @hlabs/app-manifest. */
const manifestBits = z.object({
  name: z.string().optional(),
  icon: z
    .object({
      logo: z.string().optional(),
      gradient: z.tuple([z.string(), z.string()]).optional(),
      fallback: z.string().optional(),
    })
    .optional(),
  web: z.object({ embed: z.boolean().optional(), path: z.string().optional() }).optional(),
  ownLogin: z.boolean().optional(),
});

/** A relative logo is served with the app's assets; https logos are used as they are. */
export function logoUrl(appId: string, logo: string | undefined): string | null {
  if (!logo) return null;
  if (/^https:\/\//.test(logo)) return logo;
  return `/api/apps/${appId}/assets/${logo.replace(/^\.?\//, '')}`;
}

/** The name, icon and web bits of an installed app's catalog manifest (its own source first). */
/** The app's listing in its source's catalogue (or any source's, for an app whose source is gone). */
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

export function catalogManifest(db: HlabsDb, app: { id: string; sourceId: string | null }) {
  const row = catalogRow(db, app);
  const parsed = manifestBits.safeParse(row?.manifestJson);
  return parsed.success ? parsed.data : {};
}

/**
 * An installed app as Home and the app window show it: name, icon, state and where it opens (D-012, D-038). On the
 * LAN that's its name, or `https://hlabs.local:<port>` while its name can't be published (US-APP-05, D-086).
 */
export function appSummary(
  db: HlabsDb,
  app: typeof apps.$inferSelect,
  isPublished: (name: string) => boolean = () => true,
) {
  const hostname = getSetting(db, 'hostname');
  const tailnet = getSetting(db, 'remote').tailnetName?.replace(/\.ts\.net$/, '') ?? null;
  const m = catalogManifest(db, app);
  return {
    id: app.id,
    name: m.name ?? app.id,
    state: app.state,
    icon: {
      logoUrl: logoUrl(app.id, m.icon?.logo),
      gradient: m.icon?.gradient ?? null,
      fallback: m.icon?.fallback ?? null,
    },
    embed: m.web?.embed ?? false,
    /** The app asks for its own login as well as hlabs's (US-ACCT-24). */
    ownLogin: m.ownLogin ?? false,
    webPath: m.web?.path ?? '/',
    urls: {
      local:
        isPublished(`${app.hostname}.${hostname}.local`) || app.portFallback === null
          ? `https://${app.hostname}.${hostname}.local`
          : `https://${hostname}.local:${app.portFallback}`,
      tailnet:
        tailnet && app.portFallback !== null ? `https://${hostname}.${tailnet}.ts.net:${app.portFallback}` : null,
    },
  };
}

export function listApps(
  db: HlabsDb,
  user: { id: string; role: 'admin' | 'member' },
  isPublished?: (name: string) => boolean,
) {
  const visible = new Set(visibleAppIds(db, user));
  return {
    apps: db
      .select()
      .from(apps)
      .orderBy(apps.installedAt)
      .all()
      .filter((app) => visible.has(app.id))
      .map((app) => {
        const { webPath: _path, ...tile } = appSummary(db, app, isPublished);
        return tile;
      }),
  };
}
