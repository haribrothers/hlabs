// Notifications (US-STATE-16): stored in `notifications` for one user or all admins (`user_id` null), announced on
// the bus so every open session of that person toasts them, and marked read from any one of those sessions.
import type { EventAudience, Notification, NotificationAction, Severity } from '@hlabs/api';
import { notifications, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, gte, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { EventBus } from '../events/bus';

export interface NewNotification {
  /** Null: every admin. */
  userId: string | null;
  kind: string;
  target?: string | null;
  severity: Severity;
  title: string;
  body?: string | null;
  actions?: NotificationAction[] | null;
  now?: number;
}

/** Who is asking: a user sees their own notifications, and admins also the ones for all admins. */
export interface Reader {
  userId: string;
  role: 'admin' | 'member';
}

const audienceOf = (userId: string | null): EventAudience => (userId ? { kind: 'user', userId } : { kind: 'admins' });

function visibleTo(reader: Reader): SQL {
  const own = eq(notifications.userId, reader.userId);
  return reader.role === 'admin' ? or(own, isNull(notifications.userId))! : own;
}

const cursorOf = (row: { createdAt: number; id: string }) => `${row.createdAt}:${row.id}`;

/** Rows after the cursor in newest-first order. */
function before(cursor: string): SQL | undefined {
  const [at, id] = cursor.split(':');
  const createdAt = Number(at);
  if (!id || !Number.isFinite(createdAt)) return undefined;
  return or(
    lt(notifications.createdAt, createdAt),
    and(eq(notifications.createdAt, createdAt), lt(notifications.id, id)),
  );
}

function toApi(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    kind: row.kind,
    target: row.target,
    severity: row.severity,
    title: row.title,
    body: row.body,
    actions: (row.actionJson ?? []) as NotificationAction[],
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

/** Stores a notification and announces it. Returns its id. */
export function createNotification(db: HlabsDb, bus: EventBus, n: NewNotification): string {
  const id = ulid();
  const row = db
    .insert(notifications)
    .values({
      id,
      userId: n.userId,
      kind: n.kind,
      target: n.target ?? null,
      severity: n.severity,
      title: n.title,
      body: n.body ?? null,
      actionJson: n.actions?.length ? n.actions : null,
      createdAt: n.now ?? Date.now(),
      readAt: null,
    })
    .returning()
    .get();
  const { id: _id, readAt: _readAt, ...rest } = toApi(row);
  bus.emit('notification.created', { notificationId: id, ...rest }, audienceOf(n.userId));
  return id;
}

export class NotificationService {
  constructor(
    private readonly db: HlabsDb,
    private readonly bus: EventBus,
  ) {}

  create(n: NewNotification): string {
    return createNotification(this.db, this.bus, n);
  }

  /** Newest first, `limit` at a time; `cursor` comes from the previous page (`<createdAt>:<id>`). */
  list(reader: Reader, input: { cursor?: string; limit?: number; since?: number }) {
    const limit = input.limit ?? 50;
    const rows = this.db
      .select()
      .from(notifications)
      .where(
        and(
          visibleTo(reader),
          input.cursor ? before(input.cursor) : undefined,
          input.since !== undefined ? gte(notifications.createdAt, input.since) : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1)
      .all();
    const page = rows.slice(0, limit);
    return { items: page.map(toApi), nextCursor: rows.length > limit ? cursorOf(page.at(-1)!) : null };
  }

  /** Marks these read (only ones the reader can see) and tells their other sessions, so the toasts go. */
  markRead(reader: Reader, ids: readonly string[], now = Date.now()): void {
    const rows = this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(visibleTo(reader), inArray(notifications.id, [...ids]), isNull(notifications.readAt)))
      .returning({ id: notifications.id, userId: notifications.userId })
      .all();
    const byAudience = new Map<string | null, string[]>();
    for (const r of rows) byAudience.set(r.userId, [...(byAudience.get(r.userId) ?? []), r.id]);
    for (const [userId, readIds] of byAudience)
      this.bus.emit('notification.read', { ids: readIds }, audienceOf(userId));
  }
}
