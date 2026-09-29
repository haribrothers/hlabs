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
  web: z.object({ embed: z.boolean().optional() }).optional(),
});

/** A relative logo is served with the app's assets; https logos are used as they are. */
export function logoUrl(appId: string, logo: string | undefined): string | null {
  if (!logo) return null;
  if (/^https:\/\//.test(logo)) return logo;
  return `/api/apps/${appId}/assets/${logo.replace(/^\.?\//, '')}`;
}

export function listApps(db: HlabsDb, user: { id: string; role: 'admin' | 'member' }) {
  const hostname = getSetting(db, 'hostname');
  const tailnet = getSetting(db, 'remote').tailnetName?.replace(/\.ts\.net$/, '') ?? null;
  const visible = new Set(visibleAppIds(db, user));
  return {
    apps: db
      .select()
      .from(apps)
      .orderBy(apps.installedAt)
      .all()
      .filter((app) => visible.has(app.id))
      .map((app) => {
        const row =
          (app.sourceId
            ? db
                .select()
                .from(catalogApps)
                .where(and(eq(catalogApps.sourceId, app.sourceId), eq(catalogApps.appId, app.id)))
                .get()
            : undefined) ?? db.select().from(catalogApps).where(eq(catalogApps.appId, app.id)).get();
        const parsed = manifestBits.safeParse(row?.manifestJson);
        const m = parsed.success ? parsed.data : {};
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
          urls: {
            local: `https://${app.hostname}.${hostname}.local`,
            tailnet:
              tailnet && app.portFallback !== null ? `https://${hostname}.${tailnet}.ts.net:${app.portFallback}` : null,
          },
        };
      }),
  };
}
