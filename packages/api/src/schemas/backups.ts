import { z } from 'zod';
import { io } from '../trpc';
import { empty, hlabsCodeSchema, idSchema, jobRefSchema, ok, passwordSchema } from './common';

const retentionSchema = z.object({
  daily: z.number().int().min(1).max(30),
  weekly: z.number().int().min(0).max(12),
  monthly: z.number().int().min(0).max(24),
});

/** What every backup copies (US-BKP-23, D-134): app ids, Home folders as `users/<name>`, and `shared`. */
export const backupIncludeSchema = z.object({
  apps: z.array(z.string()),
  folders: z.array(z.string()),
  includeNewApps: z.boolean(),
});

const destinationRef = z.object({ destinationId: idSchema });

/** Where backups go (US-BKP-08, D-132). "Another hlabs" waits for the Backup receiver app (Q-18). */
export const destinationTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cloud'),
    endpoint: z
      .string()
      .trim()
      .url()
      .refine((u) => u.startsWith('https://'), 'Use an https address'),
    bucket: z.string().trim().min(1).max(63),
    accessKey: z.string().trim().min(1).max(256),
    secretKey: z.string().min(1).max(256),
  }),
  z.object({
    type: z.literal('network'),
    /** A network drive already connected… */
    locationId: idSchema.optional(),
    /** …or a share typed here, connected as US-FILE-11 does with "Let apps use this drive" off. */
    address: z
      .object({ protocol: z.enum(['smb', 'nfs']), host: z.string().min(1), share: z.string().min(1) })
      .optional(),
    username: z.string().max(256).optional(),
    password: z.string().max(1024).optional(),
  }),
  z.object({
    type: z.literal('external'),
    /** The drive's mount point, from `storage.listDrives`. */
    drivePath: z.string().min(1),
    folder: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^/\\]+$/, 'One folder name')
      .default('hlabs-backups'),
  }),
]);

const destinationInput = z.object({
  name: z.string().trim().min(1).max(60),
  target: destinationTargetSchema,
  /** The encryption password: the generated one, or the one that opens backups already there (US-BKP-09, -10). */
  repoPassword: z.string().min(8).max(1024),
});

export const backupDestinationSchema = z.object({
  id: idSchema,
  kind: z.enum(['local', 'smb', 'nfs', 's3', 'sftp', 'hlabs']),
  name: z.string(),
  /** Where it is, for people: "nas.local/Backups", "s3.eu-central-003.backblazeb2.com/hlabs-backups", "Backup disk". */
  location: z.string(),
  /** `attention`: reached, but tidying up old restore points failed (US-BKP-06). */
  status: z.enum(['ok', 'unreachable', 'attention']),
  usedBytes: z.number().nonnegative().nullable(),
  restorePoints: z.number().int().nonnegative().nullable(),
  /** Cloud storage (later SFTP and another hlabs): counts as an off-site copy (US-BKP-02). */
  offsite: z.boolean(),
  /** Edit can change its access key and secret key (cloud storage). */
  hasKeys: z.boolean(),
  /** A backup to it is running: Remove waits (US-BKP-11). */
  busy: z.boolean(),
  /** When its newest restore point was made, for "latest today, 03:00" (US-BKP-17). */
  latestAt: z.number().nullable(),
});

export const backupRunSchema = z.object({
  id: idSchema,
  destinationId: idSchema.nullable(),
  destinationName: z.string().nullable(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  trigger: z.enum(['schedule', 'manual', 'pre_update']),
  bytesAdded: z.number().nullable(),
  filesChanged: z.number().nullable(),
  error: hlabsCodeSchema.nullable(),
  appCount: z.number().int().nullable(),
  folderCount: z.number().int().nullable(),
  retry: z.boolean(),
});

export const backupItemSchema = z.object({
  kind: z.enum(['app', 'folder']),
  /** App id, or a folder id (`users/<name>`, `shared`). */
  id: z.string(),
  /** "Vaultwarden", "Home › Documents", "Shared". */
  label: z.string(),
  sizeBytes: z.number().nonnegative().nullable(),
});

export const backupRestorePointSchema = z.object({
  /** The run it came from (the `run:<id>` tag). */
  id: z.string(),
  time: z.number(),
  /** The oldest point kept for its week or month: "Weekly · 20 Sep" (US-BKP-17). */
  kind: z.enum(['daily', 'weekly', 'monthly']),
  bytesChanged: z.number().nullable(),
});

export const restoreStepSchema = z.object({
  kind: z.enum(['stop', 'safety', 'copy', 'start', 'putBack']),
  appId: z.string().nullable(),
  state: z.enum(['todo', 'running', 'done', 'failed']),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  bytesDone: z.number().nullable(),
  bytesTotal: z.number().nullable(),
});

export const restoreViewSchema = z.object({
  id: idSchema,
  jobId: idSchema.nullable(),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  /** `swap` on: "Cancel restore" is hidden (US-BKP-22). */
  cancellable: z.boolean(),
  mode: z.enum(['replace', 'copy']),
  /** What's being restored, by name: "Vaultwarden", "Home › Hari". */
  items: z.array(z.object({ kind: z.enum(['app', 'folder']), id: z.string(), label: z.string() })),
  /** The restore point's time. */
  pointTime: z.number(),
  destinationName: z.string().nullable(),
  /** Whole system with replace: hlabs restarts at the end (US-BKP-18). */
  wholeSystem: z.boolean(),
  steps: z.array(restoreStepSchema),
  error: hlabsCodeSchema.nullable(),
  /** "Home › Restored › 20 Nov 2026 03-00" for a copy. */
  copyFolder: z.string().nullable(),
});

export const restoreScopeSchema = z.object({
  mode: z.enum(['replace', 'copy']),
  apps: z.array(z.string()),
  folders: z.array(z.string()),
});

export const backups = {
  /** The top of Backups (US-BKP-01…04). */
  overview: io(
    empty,
    z.object({
      lastRun: backupRunSchema.nullable(),
      lastSuccessAt: z.number().nullable(),
      nextRunAt: z.number().nullable(),
      scheduleEnabled: z.boolean(),
      /** No success in more than twice the schedule's interval (US-BKP-01). */
      overdue: z.boolean(),
      included: z.object({
        apps: z.number().int(),
        folders: z.number().int(),
        /** Installed apps left out while "Include new apps automatically" is off (US-BKP-23). */
        notBackedUp: z.number().int(),
      }),
      destinations: z.array(backupDestinationSchema),
      plan: z.object({ scheduleCron: z.string(), retention: retentionSchema }),
      /** The backup job running now. */
      running: z.object({ jobId: idSchema, progress: z.number(), message: z.string().nullable() }).nullable(),
      /** A restore running now (or the last one, until it's seen): Backups shows its progress (US-BKP-20). */
      restoring: restoreViewSchema.nullable(),
      /** The job kind "Back up now" and "Restore…" wait for (D-020), or null. */
      blockedBy: z.string().nullable(),
      /** The last 30 runs, oldest first, for the chart (US-BKP-03). */
      chart: z.array(
        z.object({ id: idSchema, startedAt: z.number(), status: z.string(), bytesAdded: z.number().nullable() }),
      ),
    }),
  ),
  destinations: {
    list: io(empty, z.object({ destinations: z.array(backupDestinationSchema) })),
    /** Reachability, credentials and write access within 20 s (US-BKP-09). `existing`: backups are already there and
     * the password opens them; a wrong one is BACKUP_REPO_PASSWORD_WRONG with `detail.existing`. */
    test: io(destinationInput, z.object({ existing: z.boolean() })),
    add: io(destinationInput, z.object({ destinationId: idSchema })),
    /** Name, and for cloud storage its keys; tested again before saving (US-BKP-11). */
    update: io(
      destinationRef.extend({
        name: z.string().trim().min(1).max(60).optional(),
        accessKey: z.string().trim().min(1).max(256).optional(),
        secretKey: z.string().min(1).max(256).optional(),
      }),
      ok,
    ),
    /** Stops backing up there; nothing at the destination is deleted (US-BKP-11). */
    remove: io(destinationRef, ok),
  },
  plan: {
    get: io(
      empty,
      z.object({
        scheduleCron: z.string(),
        retention: retentionSchema,
        include: backupIncludeSchema,
        enabled: z.boolean(),
        pauseApps: z.boolean(),
        nextRunAt: z.number().nullable(),
        /** What can be ticked in "What's included" (US-BKP-23). */
        apps: z.array(
          backupItemSchema.extend({
            /** "library excluded" from the manifest's `backup.exclude`, or null. */
            excluded: z.string().nullable(),
          }),
        ),
        folders: z.array(backupItemSchema),
      }),
    ),
    update: io(
      z.object({
        scheduleCron: z.string().optional(),
        retention: retentionSchema.optional(),
        include: backupIncludeSchema.optional(),
        enabled: z.boolean().optional(),
        pauseApps: z.boolean().optional(),
      }),
      ok,
    ),
    estimate: io(
      z.object({ retention: retentionSchema.optional(), include: backupIncludeSchema.optional() }),
      z.object({
        /** "About N GB per full copy" (US-BKP-23). */
        fullCopyBytes: z.number().nonnegative(),
        items: z.array(z.object({ destinationId: idSchema, name: z.string(), estimatedBytes: z.number().nullable() })),
      }),
    ),
  },
  runNow: io(z.object({ destinationId: idSchema.optional() }).optional(), jobRefSchema),
  listRuns: io(
    z.object({ cursor: z.string().optional(), limit: z.number().int().min(1).max(30).default(30) }),
    z.object({ runs: z.array(backupRunSchema), nextCursor: z.string().nullable() }),
  ),
  getRun: io(z.object({ runId: idSchema }), z.object({ run: backupRunSchema, log: z.string().nullable() })),
  listSnapshots: io(destinationRef, z.object({ points: z.array(backupRestorePointSchema) })),
  getSnapshot: io(
    destinationRef.extend({ snapshotId: z.string() }),
    z.object({
      point: backupRestorePointSchema,
      items: z.array(backupItemSchema.extend({ installed: z.boolean() })),
    }),
  ),
  restore: io(
    destinationRef.extend({ snapshotId: z.string(), scope: restoreScopeSchema, password: passwordSchema }),
    jobRefSchema,
  ),
  /** A restore's steps, by its job (US-BKP-20); reloading the page picks it up from here. */
  getRestore: io(z.object({ jobId: idSchema }), restoreViewSchema),
  exportRepoPassword: io(destinationRef.extend({ password: passwordSchema }), z.object({ repoPassword: z.string() })),
};
