// Notifications as toasts (US-STATE-16): every `notification.created` on this person's event stream becomes a toast
// in each of their open sessions; `notification.read` (dealt with elsewhere) takes it away. After the stream comes
// back, notifications created in the gap are fetched and only unread warning and critical ones are toasted; success
// and info ones aren't replayed.
import type { EventOf, Notification } from '@hlabs/api';
import { actionsFromNotification } from './toast-actions';
import { SEVERITY_TONE, type ToastItem } from './toasts';

type Created = EventOf<'notification.created'>;
type Payload = Omit<Notification, 'id' | 'readAt'> & { notificationId: string };

export function toastFromNotification(n: Payload): Omit<ToastItem, 'id' | 'leaving'> {
  return {
    tone: SEVERITY_TONE[n.severity],
    title: n.title,
    ...(n.body ? { body: n.body } : {}),
    actions: actionsFromNotification(n.actions),
    notificationId: n.notificationId,
    key: `${n.kind}:${n.target ?? ''}`,
  };
}

const worthReplaying = (severity: Notification['severity']) => severity === 'warning' || severity === 'critical';

export class NotificationFeed {
  private readonly seen = new Set<string>();
  private connected = false;
  private everConnected = false;
  private connectedAt = 0;
  /** When we last knew the stream was up: the start of a gap. */
  private aliveAt = 0;

  constructor(
    private readonly deps: {
      show: (toast: Omit<ToastItem, 'id' | 'leaving'>) => void;
      hide: (notificationIds: readonly string[]) => void;
      /** Notifications created at or after `since`, newest first. */
      fetchSince: (since: number) => Promise<Notification[]>;
      now?: () => number;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  /** The stream is up (first time, or again after a drop). */
  async onConnected(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    const gapStart = this.aliveAt;
    const reconnect = this.everConnected;
    this.everConnected = true;
    this.connectedAt = this.aliveAt = this.now();
    if (!reconnect) return;
    const missed = await this.deps.fetchSince(gapStart).catch(() => [] as Notification[]);
    for (const n of [...missed].reverse()) {
      if (n.readAt !== null || !worthReplaying(n.severity) || this.seen.has(n.id)) continue;
      this.seen.add(n.id);
      const { id, readAt: _readAt, ...rest } = n;
      this.deps.show(toastFromNotification({ ...rest, notificationId: id }));
    }
  }

  /** The stream dropped. */
  onDisconnected(): void {
    if (this.connected) this.aliveAt = this.now();
    this.connected = false;
  }

  onCreated(event: Created): void {
    const n = event.data;
    if (this.seen.has(n.notificationId)) return;
    this.seen.add(n.notificationId);
    this.aliveAt = this.now();
    // Resumed from before this connection: only problems are worth showing late.
    if (event.at < this.connectedAt && !worthReplaying(n.severity)) return;
    this.deps.show(toastFromNotification(n));
  }

  onRead(event: EventOf<'notification.read'>): void {
    this.aliveAt = this.now();
    this.deps.hide(event.data.ids);
  }
}
