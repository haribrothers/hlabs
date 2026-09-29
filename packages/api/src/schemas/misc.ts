import { z } from 'zod';
import { io } from '../trpc';
import {
  appIdSchema,
  empty,
  idSchema,
  jobRefSchema,
  jobSchema,
  notificationSchema,
  ok,
  pageInputSchema,
  pageOf,
  timestampSchema,
  pending,
  usernameSchema,
} from './common';

export const notifications = {
  /** Newest first. `since`: only those created at or after it (catching up after a reconnect, US-STATE-16). */
  list: io(pageInputSchema.extend({ since: timestampSchema.optional() }), pageOf(notificationSchema)),
  unreadCount: io(empty, z.object({ count: z.number().int().nonnegative() })),
  markRead: io(z.object({ ids: z.array(idSchema).min(1) }), ok),
  markAllRead: io(empty, ok),
  dismiss: io(z.object({ ids: z.array(idSchema).min(1) }), ok),
};

export const jobs = {
  get: io(jobRefSchema, jobSchema),
  list: io(empty, z.object({ items: z.array(jobSchema) })),
  cancel: io(jobRefSchema, ok),
};

export const ai = {
  get: io(empty, pending),
  setEnabled: io(z.object({ enabled: z.boolean() }), ok),
  setPermissions: io(z.object({ read: z.boolean(), control: z.boolean() }), ok),
  activity: io(pageInputSchema, pending),
  tokens: {
    create: io(z.object({ name: z.string().min(1).max(60) }), z.object({ tokenId: idSchema, token: z.string() })),
    list: io(empty, pending),
    revoke: io(z.object({ tokenId: idSchema }), ok),
  },
};

export const tray = {
  status: io(empty, pending),
  listUsers: io(empty, pending),
  quickAction: io(
    z.object({ action: z.enum(['openDashboard', 'copyAddress', 'backupNow', 'pauseAll', 'resumeAll']) }),
    z.union([ok, jobRefSchema, z.object({ url: z.string() })]),
  ),
  resetPassword: io(z.object({ username: usernameSchema, newPassword: z.string(), disableTotp: z.boolean() }), ok),
  setStartAtLogin: io(z.object({ enabled: z.boolean() }), ok),
  appLogs: io(
    z.object({
      appId: appIdSchema,
      tail: z.number().int().optional(),
      since: z.number().int().optional(),
      follow: z.boolean().optional(),
    }),
    pending,
  ),
  startEngine: io(empty, jobRefSchema),
  diagnostics: io(empty, z.object({ report: z.string() })),
  uninstallInfo: io(empty, pending),
  uninstall: io(z.object({ keepData: z.boolean(), removeColima: z.boolean() }), jobRefSchema),
  setupUrl: io(empty, z.object({ url: z.string().nullable(), lanUrls: z.array(z.string()) })),
};
