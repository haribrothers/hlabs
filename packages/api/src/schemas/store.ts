import { z } from 'zod';
import { io } from '../trpc';
import { appRefSchema, empty, idSchema, ok, pageInputSchema, pending } from './common';

export const store = {
  getHome: io(empty, pending),
  listApps: io(
    pageInputSchema.extend({
      category: z.string().optional(),
      query: z.string().max(200).optional(),
      source: idSchema.optional(),
      sort: z.enum(['popular', 'new', 'name']).optional(),
      installedOnly: z.boolean().optional(),
      arm64Only: z.boolean().optional(),
    }),
    pending,
  ),
  getApp: io(appRefSchema.extend({ source: idSchema.optional() }), pending),
  listCategories: io(empty, pending),
  listUpdates: io(empty, pending),
  sources: {
    list: io(empty, pending),
    inspect: io(z.object({ url: z.string().url() }), pending),
    add: io(z.object({ url: z.string().url(), publicKey: z.string().optional() }), z.object({ sourceId: idSchema })),
    remove: io(z.object({ sourceId: idSchema }), ok),
    sync: io(z.object({ sourceId: idSchema.optional() }), ok),
  },
};
