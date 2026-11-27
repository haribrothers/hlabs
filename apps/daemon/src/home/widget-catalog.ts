// The widget picker's catalog (US-HOME-19): hlabs's own widgets for this person's role, then the widgets the apps
// they can open declare. Widgets read with an admin's key are offered to admins only (D-157).
import type { HlabsDb } from '@hlabs/db';
import type { SecretStore } from '../platform/secrets';
import { widgetKeyRef } from './app-widgets';
import { appWidgetsOf, memberSeesUsage, SYSTEM_WIDGET_NAMES, SYSTEM_WIDGETS, visibleAppIds } from './layout';

export async function widgetCatalog(
  services: { db: HlabsDb; secrets: SecretStore },
  user: { id: string; role: 'admin' | 'member' },
) {
  const { db } = services;
  const usage = user.role === 'admin' || memberSeesUsage(db, user.id);
  const system = SYSTEM_WIDGETS[user.role]
    .filter((id) => id !== 'live-usage' || usage)
    .map((id) => ({ id, name: SYSTEM_WIDGET_NAMES[id]! }));
  const appWidgets = [];
  for (const appId of visibleAppIds(db, user)) {
    const app = appWidgetsOf(db, appId);
    if (!app) continue;
    for (const w of app.widgets) {
      if (w.auth && user.role !== 'admin') continue;
      appWidgets.push({
        id: `app:${appId}:${w.id}`,
        appId,
        appName: app.name,
        name: w.name,
        template: w.template,
        needsKey: Boolean(w.auth),
        hasKey: w.auth ? Boolean(await services.secrets.get(widgetKeyRef(appId))) : false,
      });
    }
  }
  return { system, apps: appWidgets };
}
