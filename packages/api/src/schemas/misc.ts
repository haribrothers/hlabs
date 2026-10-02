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

/** What the tray shows (US-INST-05; 05 "From 01 · Install & menu-bar app"). */
export const trayStatusSchema = z.object({
  /** `starting`: apps are being brought up (US-INST-11); `paused` comes with US-INST-08. */
  state: z.enum(['starting', 'running', 'paused', 'engineStopped']),
  /** Installed apps in state `running`. */
  appsRunning: z.number().int().nonnegative(),
  /** Installed apps that should be running (not stopped on purpose). */
  appsExpected: z.number().int().nonnegative(),
  /** Apps in `error` (US-INST-11: "· 1 needs attention"). */
  appsNeedAttention: z.number().int().nonnegative(),
  /** The first app that should run but isn't, for "Show startup log"; null when all are running. */
  startupLogAppId: appIdSchema.nullable(),
  paused: z.boolean(),
  /** Host CPU in use, 0–100; null when it can't be read. */
  cpuPercent: z.number().min(0).max(100).nullable(),
  /** Host memory in use, bytes. */
  memoryUsedBytes: z.number().nonnegative().nullable(),
  /** Free space on the storage root, bytes. */
  freeBytes: z.number().nonnegative().nullable(),
  engine: z.object({
    /** The engine kind (`orbstack`, `colima`, `docker-desktop`, `docker-engine`); null when none was found. */
    name: z.string().nullable(),
    running: z.boolean(),
    managedByHlabs: z.boolean(),
    /** "Start engine" is offered (not for Docker Engine on Linux, US-INST-12). */
    canStart: z.boolean(),
  }),
  /** The dashboard's current address (the renamed name, or the LAN address when mDNS fell back). */
  dashboardUrl: z.string(),
  backup: z.object({
    configured: z.boolean(),
    lastSucceededAt: timestampSchema.nullable(),
    running: z.boolean(),
    progress: z.number().min(0).max(1).nullable(),
    lastFailed: z.boolean(),
  }),
  updateChannel: z.enum(['stable', 'beta']),
  autoUpdate: z.boolean(),
  exclusiveJobRunning: z.boolean(),
  onboardingComplete: z.boolean(),
  /** The first admin's "Reduce transparency" (Settings › Appearance). */
  reduceTransparency: z.boolean(),
});
export type TrayStatus = z.infer<typeof trayStatusSchema>;

export const tray = {
  status: io(empty, trayStatusSchema),
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
