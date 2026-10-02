import { ONBOARDING_STEPS, serverNameSchema } from '@hlabs/shared';
import { z } from 'zod';
import { io } from '../trpc';
import { remoteConnectInput, remoteConnectResult } from './network';
import {
  appIdSchema,
  displayNameSchema,
  empty,
  engineKindSchema,
  jobStateSchema,
  jobIdsSchema,
  jobRefSchema,
  ok,
  passwordSchema,
  pending,
  totpCodeSchema,
} from './common';
import { storeAppSchema } from './store';

/** Steps from the shared registry (D-041; 04 `settings.onboarding.step`). */
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);

/** A system-check row: ok, a warning that doesn't block Continue, or an error that does (US-ONB-04). */
export const checkLevelSchema = z.enum(['ok', 'warning', 'error']);

const portCheckSchema = z.object({
  /** The standard port (80 or 443). */
  port: z.number().int(),
  inUse: z.boolean(),
  /** The port Caddy will use: the standard one, or 8080 / 8443 when it's taken. */
  use: z.number().int(),
});

export const systemCheckSchema = z.object({
  cpu: z.object({ model: z.string(), arch: z.string() }),
  os: z.object({ platform: z.enum(['darwin', 'linux']), name: z.string(), version: z.string(), headless: z.boolean() }),
  engine: z.object({
    kind: engineKindSchema.nullable(),
    version: z.string().nullable(),
    /**
     * running; stopped (a socket that doesn't answer, or OrbStack / Docker Desktop installed but not started);
     * noAccess (the socket exists but this account can't use it, e.g. not in the `docker` group); missing.
     */
    state: z.enum(['running', 'stopped', 'noAccess', 'missing']),
    level: checkLevelSchema,
    /** The latest hlabs-managed Colima install (US-ONB-05), if any. */
    install: z
      .object({
        jobId: z.string(),
        state: jobStateSchema,
        progress: z.number().int().min(0).max(100),
        lastLogLine: z.string().nullable(),
        hlabsCode: z.string().nullable(),
        /** The whole install log, with `includeLog` (US-ONB-06). */
        log: z.string().optional(),
      })
      .nullable(),
  }),
  /** Free space at the default storage root: error below 10 GB, warning below 30 GB. */
  disk: z.object({ freeBytes: z.number().nonnegative(), path: z.string(), level: checkLevelSchema }),
  ports: z.object({ http: portCheckSchema, https: portCheckSchema, level: checkLevelSchema }),
  /** Every blocking check passes. */
  canContinue: z.boolean(),
  /** The name on the network (`<hostname>.local`), chosen on this step (D-098). */
  hostname: z.string(),
});

export const onboarding = {
  /** Public: never returns user data (US-ONB-01, US-ONB-03). */
  status: io(empty, z.object({ completed: z.boolean(), step: onboardingStepSchema, hasUsers: z.boolean() })),
  checkSystem: io(z.object({ includeLog: z.boolean().optional() }).optional(), systemCheckSchema),
  confirmSystem: io(z.object({ startAtLogin: z.boolean(), hostname: serverNameSchema.optional() }), ok),
  installEngine: io(empty, jobRefSchema),
  setStep: io(z.object({ step: onboardingStepSchema }), ok),
  /** The username is lowercased before it's checked, so any string up to 64 characters is accepted here. */
  createAdmin: io(
    z.object({ username: z.string().trim().min(1).max(64), displayName: displayNameSchema, password: passwordSchema }),
    z.object({ userId: z.string() }),
  ),
  /** The QR code is drawn by the dashboard from `otpauthUrl` (US-ONB-11). */
  setupTotp: io(empty, z.object({ otpauthUrl: z.string(), secret: z.string() })),
  confirmTotp: io(z.object({ code: totpCodeSchema }), z.object({ recoveryCodes: z.array(z.string()) })),
  setStorage: io(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('local'), path: z.string().optional() }),
      z.object({ kind: z.literal('external'), path: z.string() }),
      /** A share added with storage.locations.addNetwork (US-ONB-16). */
      z.object({ kind: z.literal('nas'), locationId: z.string() }),
    ]),
    ok,
  ),
  /** The remote step's Connect (US-ONB-17): the same as `network.remote.connect`, with the admin's session. */
  connectRemote: io(remoteConnectInput, remoteConnectResult),
  /** OnbApps' tiles (US-ONB-19): each starter app, what memory it recommends and whether the engine has that free. */
  starterApps: io(
    empty,
    z.object({
      apps: z.array(
        z.object({ app: storeAppSchema, memoryBytes: z.number().nullable(), needsMoreMemory: z.boolean() }),
      ),
    }),
  ),
  installStarterApps: io(z.object({ appIds: z.array(appIdSchema).min(1).max(8) }), jobIdsSchema),
  findBackups: io(empty, pending),
  listRestorePoints: io(z.object({ destination: pending, password: passwordSchema }), pending),
  restoreFromBackup: io(pending, jobRefSchema),
  complete: io(empty, z.object({ redirectTo: z.string() })),
};
