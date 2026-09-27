import { z } from 'zod';
import { io } from '../trpc';
import { appIdSchema, empty, pending } from './common';

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
  searchEverything: io(z.object({ query: z.string().max(200) }), pending),
};
