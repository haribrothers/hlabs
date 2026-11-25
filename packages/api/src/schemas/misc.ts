import { z } from 'zod';
import { io } from '../trpc';
import { logLineSchema } from './apps';
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
  /** The saved "Start at login" (Settings › Engine & startup); the tray applies it when the OS differs (D-042). */
  startAtLogin: z.boolean(),
  updateChannel: z.enum(['stable', 'beta']),
  autoUpdate: z.boolean(),
  /** A job that "Restart to update" must wait for (restore, move all data…; not the update itself, US-INST-20). */
  exclusiveJobRunning: z.boolean(),
  /**
   * An update the dashboard asked for ("Update now", or the overnight window): the tray applies it (US-INST-20). The
   * tray polls this rather than keeping an event stream open; `update.applyRequested` is emitted too.
   */
  updateRequested: z.object({ jobId: z.string(), version: z.string() }).nullable(),
  /**
   * Another program holds hlabs's web port, so other devices can't reach it (US-SYS-42): which port, what holds it
   * when hlabs can tell, and the port "Use port 8443" moves to.
   */
  portProblem: z
    .object({ port: z.number().int(), heldBy: z.enum(['tailscaleServe']).nullable(), fallbackPort: z.number().int() })
    .nullable(),
  onboardingComplete: z.boolean(),
  /** The first admin's "Reduce transparency" (Settings › Appearance). */
  reduceTransparency: z.boolean(),
  /**
   * How many apps are public on the internet, and their names ("Public: 2 apps · Immich, Jellyfin", US-SYS-44): the
   * menu offers "Turn off public access" while any is. Always sent (optional only for older fixtures).
   */
  publicApps: z.number().int().nonnegative().optional(),
  publicAppNames: z.array(z.string()).optional(),
});
export type TrayStatus = z.infer<typeof trayStatusSchema>;

/** An account the tray can reset (US-INST-17). */
export const trayUserSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: z.string(),
  role: z.enum(['admin', 'member']),
  totpEnabled: z.boolean(),
});
export type TrayUser = z.infer<typeof trayUserSchema>;

/** A library signing key's public half (US-STORE-28); the private half never leaves the daemon's keychain. */
const libraryKeySchema = z.object({ publicKey: z.string(), fingerprint: z.string() });

export const tray = {
  status: io(empty, trayStatusSchema),
  /**
   * `hlabs library keygen` (US-STORE-28): an ed25519 key for signing libraries, kept in the keychain (or the encrypted
   * file on a headless server). With one already, it's returned (`existed`) unless `replace`.
   */
  libraryKeygen: io(
    z.object({ replace: z.boolean().default(false) }),
    libraryKeySchema.extend({ existed: z.boolean() }),
  ),
  /** `hlabs library sign`: index.json's bytes (base64, ≤ 1 MB) → its minisign signature with that key. */
  librarySign: io(z.object({ data: z.string().max(1_400_000) }), libraryKeySchema.extend({ signature: z.string() })),
  /** Enabled accounts, admins first, then by name (US-INST-17). */
  listUsers: io(empty, z.object({ users: z.array(trayUserSchema) })),
  quickAction: io(
    z.object({ action: z.enum(['openDashboard', 'copyAddress', 'backupNow', 'pauseAll', 'resumeAll']) }),
    z.union([ok, jobRefSchema, z.object({ url: z.string() })]),
  ),
  resetPassword: io(
    z.object({
      username: usernameSchema,
      newPassword: z.string(),
      disableTotp: z.boolean(),
      /** `cli`: `hlabs reset-password` on a Linux server (US-INST-25); recorded in the audit log. */
      via: z.enum(['tray', 'cli']).optional(),
    }),
    ok,
  ),
  /**
   * "Quit hlabs" (US-INST-10, D-120): stops every app (data untouched) and answers once they're stopped; the tray then
   * stops the daemon. The next start brings back the apps that were up. JOB_EXCLUSIVE_RUNNING during an update or a
   * restore.
   */
  quit: io(empty, ok),
  /** "Use port 8443" (US-SYS-42): moves hlabs off the port another program holds; NETWORK_PORT_IN_USE if that's taken too. */
  useOtherPort: io(empty, ok),
  setStartAtLogin: io(z.object({ enabled: z.boolean() }), ok),
  appLogs: io(
    z.object({
      appId: appIdSchema,
      tail: z.number().int().optional(),
      since: z.number().int().optional(),
      follow: z.boolean().optional(),
    }),
    z.object({ lines: z.array(logLineSchema) }),
  ),
  startEngine: io(empty, jobRefSchema),
  diagnostics: io(empty, z.object({ report: z.string() })),
  /** What the uninstall window says (US-INST-21, D-143). */
  uninstallInfo: io(
    empty,
    z.object({
      appCount: z.number().int().nonnegative(),
      /** What "Delete everything" removes; null when counting took over 10 s. */
      dataBytes: z.number().nonnegative().nullable(),
      storageRoot: z.string(),
      /** The engine is hlabs's own Colima, so "Also remove Colima" is offered. */
      colimaManaged: z.boolean(),
    }),
  ),
  /** The `hlabs_uninstall` job (US-INST-22, D-143, D-144); `via: cli` from `hlabs uninstall`. */
  uninstall: io(
    z.object({ keepData: z.boolean(), removeColima: z.boolean(), via: z.enum(['tray', 'cli']).optional() }),
    jobRefSchema,
  ),
  /**
   * "Turn off public access" (US-SYS-44), after the computer's own confirmation (Touch ID or the login password, as
   * for US-INST-18): the same `public_off_all` job as Settings; the one already running when there is one.
   */
  publicOff: io(empty, jobRefSchema),
  /** A job, for following `hlabs_uninstall` or `public_off_all` (the tray token may call tray.* only). */
  job: io(jobRefSchema, jobSchema),
  /** The setup URL, and with Caddy the same at each LAN address and at the published `.local` name (US-INST-24). */
  setupUrl: io(
    empty,
    z.object({ url: z.string().nullable(), lanUrls: z.array(z.string()), mdnsUrl: z.string().nullable() }),
  ),
};
