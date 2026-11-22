import { z } from 'zod';
import { io } from '../trpc';
import { homeAppSchema } from './apps';
import { appIdSchema, empty } from './common';
import { storeAppSchema } from './store';

const layoutItemSchema = z.object({ kind: z.enum(['app', 'widget']), id: z.string() });

/** A widget's template and its filled-in values (US-HOME-20): text only, never markup. */
const statValueSchema = z.object({ value: z.union([z.string(), z.number()]), label: z.string() });
export const appWidgetDataSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('stat'), value: statValueSchema }),
  z.object({ template: z.literal('twoStat'), first: statValueSchema, second: statValueSchema }),
  z.object({
    template: z.literal('list'),
    rows: z.array(z.object({ title: z.string(), detail: z.string().nullable() })).max(3),
  }),
]);
export type AppWidgetData = z.infer<typeof appWidgetDataSchema>;

/** What the widget picker offers this person (US-HOME-19). App widget ids are `app:<appId>:<widgetId>`. */
export const widgetCatalogSchema = z.object({
  system: z.array(z.object({ id: z.string(), name: z.string() })),
  apps: z.array(
    z.object({
      id: z.string(),
      appId: appIdSchema,
      appName: z.string(),
      name: z.string(),
      template: z.enum(['stat', 'twoStat', 'list']),
      /** Needs an API key made in the app (admins only, D-157); `hasKey` once an admin has added it. */
      needsKey: z.boolean(),
      hasKey: z.boolean(),
    }),
  ),
});

export const home = {
  /** `hidden`: apps taken off Home, still installed (US-HOME-18). */
  getLayout: io(
    empty,
    z.object({ items: z.array(layoutItemSchema), dock: z.array(appIdSchema), hidden: z.array(appIdSchema) }),
  ),
  saveLayout: io(
    z.object({ items: z.array(layoutItemSchema), hidden: z.array(appIdSchema).optional() }),
    z.object({ items: z.array(layoutItemSchema), hidden: z.array(appIdSchema) }),
  ),
  saveDock: io(z.object({ appIds: z.array(appIdSchema).max(8) }), z.object({ dock: z.array(appIdSchema) })),
  listWidgets: io(empty, widgetCatalogSchema),
  getWidgetData: io(
    z.object({ widgetIds: z.array(z.string()) }),
    z.record(
      z.string(),
      z.object({
        /** `needs_key`: an app widget whose API key no admin has added yet. On `error`, `data` is the last good value, if any. */
        status: z.enum(['ok', 'app_not_running', 'error', 'needs_key']),
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
      /** Admins: an app's settings, restarting it, its logs. Everyone: "Add <App> to Home" for an app taken off Home (US-HOME-18). */
      actions: z.array(
        z.object({
          kind: z.enum(['settings', 'restart', 'logs', 'addToHome']),
          appId: appIdSchema,
          appName: z.string(),
        }),
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
