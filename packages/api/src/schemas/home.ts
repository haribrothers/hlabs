import { z } from 'zod';
import { io } from '../trpc';
import { homeAppSchema } from './apps';
import { appIdSchema, empty, pending } from './common';
import { storeAppSchema } from './store';

const layoutItemSchema = z.object({ kind: z.enum(['app', 'widget']), id: z.string() });

export const home = {
  getLayout: io(empty, z.object({ items: z.array(layoutItemSchema), dock: z.array(appIdSchema) })),
  saveLayout: io(z.object({ items: z.array(layoutItemSchema) }), z.object({ items: z.array(layoutItemSchema) })),
  saveDock: io(z.object({ appIds: z.array(appIdSchema).max(8) }), z.object({ dock: z.array(appIdSchema) })),
  listWidgets: io(empty, pending),
  getWidgetData: io(
    z.object({ widgetIds: z.array(z.string()) }),
    z.record(
      z.string(),
      z.object({
        status: z.enum(['ok', 'app_not_running', 'error']),
        data: z.unknown().optional(),
        updatedAt: z.number(),
      }),
    ),
  ),
  /**
   * Search (US-HOME-09, US-HOME-10): groups in display order, filtered for this person. An empty query gives the
   * installed apps (up to 8, in layout order) and nothing else.
   */
  searchEverything: io(
    z.object({ query: z.string().max(200), limitPerGroup: z.number().int().min(1).max(20).default(5) }),
    z.object({
      installed: z.array(homeAppSchema),
      /** Admins only: an app's settings, restarting it, its logs. */
      actions: z.array(
        z.object({ kind: z.enum(['settings', 'restart', 'logs']), appId: appIdSchema, appName: z.string() }),
      ),
      /** At most 3 apps not installed yet; null when this person can't install apps (no App Store group). */
      store: z.array(storeAppSchema).nullable(),
      /** Every App Store match, for "See all App Store results". */
      storeTotal: z.number().int().nonnegative(),
      /** This person's files; null until Files ships (phase 5, D-036). */
      files: z.array(z.object({ path: z.string(), name: z.string(), breadcrumb: z.array(z.string()) })).nullable(),
      /** Settings pages this person can open. */
      settings: z.array(z.object({ section: z.string(), title: z.string() })),
    }),
  ),
};
