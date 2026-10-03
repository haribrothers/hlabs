// Typed events on the daemon's bus, forwarded through `events.stream` (docs/prd/02-architecture.md §2.12).
import { z } from 'zod';
import { hlabsCodeSchema } from './schemas/common';
import { usageSampleSchema } from './schemas/usage';
import {
  appStateSchema,
  engineKindSchema,
  installStepDetailSchema,
  installStepSchema,
  jobKindSchema,
  jobStateSchema,
  notificationSchema,
} from './schemas/common';

export const eventSchemas = {
  'system.status': z.object({ state: z.enum(['ready', 'updating']) }),
  'engine.status': z.object({
    running: z.boolean(),
    kind: engineKindSchema.nullable(),
    managedByHlabs: z.boolean(),
    socketPath: z.string().nullable(),
  }),
  'access.changed': z.object({ userId: z.string() }),
  'storage.locationChanged': z.object({
    locationId: z.string(),
    change: z.enum(['added', 'removed', 'mounted', 'offline']),
  }),
  'update.applyRequested': z.object({ jobId: z.string(), version: z.string() }),
  'startup.changeRequested': z.object({ startAtLogin: z.boolean() }),
  'app.stateChanged': z.object({ appId: z.string(), state: appStateSchema, detail: z.string().nullable() }),
  /** An install's progress (US-STORE-12): the step it's on, that step's detail and the time left once known. */
  'app.installProgress': z.object({
    appId: z.string(),
    jobId: z.string(),
    progress: z.number().min(0).max(100),
    step: installStepSchema.optional(),
    stepDetail: installStepDetailSchema.optional(),
    etaSeconds: z.number().int().nonnegative().nullable().optional(),
  }),
  'app.log': z.object({
    appId: z.string(),
    service: z.string(),
    stream: z.enum(['stdout', 'stderr']),
    ts: z.number(),
    line: z.string(),
  }),
  'job.progress': z.object({
    jobId: z.string(),
    kind: jobKindSchema,
    target: z.string().nullable(),
    progress: z.number().min(0).max(100),
    message: z.string().nullable(),
  }),
  'job.finished': z.object({
    jobId: z.string(),
    kind: jobKindSchema,
    target: z.string().nullable(),
    state: jobStateSchema,
    hlabsCode: hlabsCodeSchema.nullable(),
  }),
  'backup.run': z.object({
    runId: z.string(),
    status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
    progress: z.number().min(0).max(100).optional(),
  }),
  /** The whole notification, so every open session can toast it (US-STATE-16). */
  'notification.created': notificationSchema.omit({ id: true, readAt: true }).extend({ notificationId: z.string() }),
  /** Marked read in one session; the others drop its toast. */
  'notification.read': z.object({ ids: z.array(z.string()).min(1) }),
  'usage.sample': usageSampleSchema,
  'update.available': z.object({ version: z.string(), channel: z.enum(['stable', 'beta']) }),
  'session.revoked': z.object({ sessionId: z.string() }),
  /** Sent by `events.stream` itself (not the bus) when it can't resume from the client's lastEventId, such as after
   * a daemon restart or a gap longer than the buffer: the client refetches everything (US-STATE-18). */
  'stream.reset': z.object({}),
  /** Dev only: proves events reach the browser (phase 0 "Done when"). */
  'system.test': z.object({ message: z.string() }),
} as const;

export type EventType = keyof typeof eventSchemas;
export const EVENT_TYPES = Object.keys(eventSchemas) as EventType[];

export type HlabsEvent = {
  [T in EventType]: { type: T; at: number; data: z.output<(typeof eventSchemas)[T]> };
}[EventType];
export type EventOf<T extends EventType> = Extract<HlabsEvent, { type: T }>;

/**
 * Who may receive an event. The daemon attaches one when it emits; `events.stream` filters by it.
 * - `all`: every signed-in user · `admins` · `user`: one user · `tray`: the tray token only.
 */
export type EventAudience =
  | { kind: 'all' }
  | { kind: 'admins' }
  | { kind: 'user'; userId: string }
  /** One signed-in device: the stream opened with that session (US-AUTH-15). */
  | { kind: 'session'; sessionId: string }
  | { kind: 'tray' };

/** Tray-scoped events never reach browser sessions (02 §2.12). */
export const TRAY_EVENTS: ReadonlySet<EventType> = new Set(['update.applyRequested', 'startup.changeRequested']);

export const eventsStreamInputSchema = z
  .object({
    /** Set by the SSE client on reconnect; the daemon replays newer events from its 500-event buffer. */
    lastEventId: z.string().nullish(),
    types: z.array(z.enum(EVENT_TYPES as [EventType, ...EventType[]])).optional(),
  })
  .optional();
