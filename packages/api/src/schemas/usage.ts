import { z } from 'zod';
import { io } from '../trpc';
import { appRefSchema, empty, pending } from './common';

export const usageRangeSchema = z.enum(['1h', '24h', '7d', '30d']);

export const usage = {
  current: io(empty, pending),
  history: io(
    z.object({
      scope: z.union([z.literal('host'), z.string()]),
      range: usageRangeSchema,
      metric: z.string().optional(),
    }),
    pending,
  ),
  topApps: io(z.object({ limit: z.number().int().min(1).max(50).default(5) }).optional(), pending),
  appDetail: io(appRefSchema, pending),
};
