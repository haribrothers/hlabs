// The bell on Home and its panel (US-HOME-13, 14; HomeNotifications): how many are new, the list grouped "Today" and
// "Earlier", each with what to do about it; reading, acting on and dismissing them. New ones arrive on the event
// stream; marking read is optimistic and rolls back if the daemon refuses.
import type { Notification } from '@hlabs/api';
import { Bell, Check, CircleX, Download, iconDefaults, Info, Lock, TriangleAlert, X } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE, type ToastMutation } from '@hlabs/shared';
import { Button } from '@hlabs/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { notificationsCopy as copy } from '../copy/notifications';
import { toastCopy } from '../copy/toasts';
import { notificationTime, isToday } from '../lib/notification-time';
import { actionsFromNotification, runToastMutation, visibleActions } from '../lib/toast-actions';
import { showToast, type ToastAction } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { errorLine } from '../lib/error-copy';

const PAGE = 50;

/** The tile beside each item: what kind of news it is, never by colour alone. */
function SeverityIcon({ n }: { n: Notification }) {
  const props = { ...iconDefaults, 'aria-hidden': true as const, className: 'size-4' };
  const [icon, tone]: [ReactNode, string] = n.kind.startsWith('auth.')
    ? [<Lock key="i" {...props} />, 'text-warning']
    : /update/.test(n.kind) && n.severity === 'info'
      ? [<Download key="i" {...props} />, 'text-accent']
      : n.severity === 'critical'
        ? [<CircleX key="i" {...props} />, 'text-danger']
        : n.severity === 'warning'
          ? [<TriangleAlert key="i" {...props} />, 'text-warning']
          : n.severity === 'success'
            ? [<Check key="i" {...props} />, 'text-success']
            : [<Info key="i" {...props} />, 'text-accent'];
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-sm bg-surface-control ${tone}`}>{icon}</span>
  );
}

/** The app an action is about, if it names one: `/apps/<id>/…` or a mutation's `appId`. */
function appOf(a: ToastAction): string | null {
  if (a.kind === 'navigate') return /^\/apps\/([^/]+)/.exec(a.to)?.[1] ?? null;
  if (a.kind === 'mutation') return typeof a.input.appId === 'string' ? a.input.appId : null;
  return null;
}

/** `shippedPhase`: the phase whose controls show (tests set it; D-036). */
export function NotificationsBell({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number }) {
  if (!isFeatureEnabled('notifications', shippedPhase)) return null;
  return <Panel shippedPhase={shippedPhase} />;
}

function Panel({ shippedPhase }: { shippedPhase: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const now = useNow().getTime();
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const countKey = trpc.notifications.unreadCount.queryKey();
  const listKey = trpc.notifications.list.infiniteQueryKey({ limit: PAGE });
  const count = useQuery({ ...trpc.notifications.unreadCount.queryOptions(), retry: false });
  const list = useInfiniteQuery({
    ...trpc.notifications.list.infiniteQueryOptions({ limit: PAGE }, { getNextPageParam: (p) => p.nextCursor }),
    enabled: open,
    retry: false,
  });
  const unread = count.data?.count ?? 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: countKey });
    void queryClient.invalidateQueries({ queryKey: trpc.notifications.list.pathKey() });
  };
  // A new one: the badge counts it and, while the panel's open, it's at the top of Today (US-HOME-13). Read or
  // dismissed in another session: this one follows.
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['notification.created', 'notification.read', 'notification.dismissed'] },
      {
        onData: ({ data: event }) => {
          if (event.type === 'notification.created') {
            queryClient.setQueryData(countKey, (c) => (c ? { count: c.count + 1 } : c));
          }
          refresh();
        },
      },
    ),
  );

  // Escape or a click outside closes it, and focus goes back to the bell.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      bellRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !bellRef.current?.contains(t)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  /** Optimistic: the dots and the badge change now, and come back if the daemon says no. */
  const markRead = async (ids: string[] | 'all') => {
    const before = { count: queryClient.getQueryData(countKey), list: queryClient.getQueryData(listKey) };
    const at = Date.now();
    const unreadIds = new Set<string>();
    queryClient.setQueryData(listKey, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((n) => {
                if (n.readAt !== null || (ids !== 'all' && !ids.includes(n.id))) return n;
                unreadIds.add(n.id);
                return { ...n, readAt: at };
              }),
            })),
          }
        : old,
    );
    queryClient.setQueryData(countKey, (c) =>
      c ? { count: ids === 'all' ? 0 : Math.max(0, c.count - (unreadIds.size || ids.length)) } : c,
    );
    try {
      if (ids === 'all') await client.notifications.markAllRead.mutate();
      else await client.notifications.markRead.mutate({ ids });
    } catch (err) {
      queryClient.setQueryData(countKey, before.count);
      queryClient.setQueryData(listKey, before.list);
      showToast({ tone: 'danger', title: errorLine(err) });
    }
  };

  const dismiss = async (n: Notification) => {
    const before = { count: queryClient.getQueryData(countKey), list: queryClient.getQueryData(listKey) };
    queryClient.setQueryData(listKey, (old) =>
      old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.filter((x) => x.id !== n.id) })) } : old,
    );
    if (n.readAt === null) queryClient.setQueryData(countKey, (c) => (c ? { count: Math.max(0, c.count - 1) } : c));
    try {
      await client.notifications.dismiss.mutate({ ids: [n.id] });
    } catch (err) {
      queryClient.setQueryData(countKey, before.count);
      queryClient.setQueryData(listKey, before.list);
      showToast({ tone: 'danger', title: errorLine(err) });
    }
  };

  /** Acting on one reads it (US-HOME-14); an app that's gone says so instead. */
  const act = async (n: Notification, a: ToastAction) => {
    void markRead([n.id]);
    const appId = appOf(a);
    if (appId) {
      const apps = await queryClient.fetchQuery(trpc.apps.list.queryOptions()).catch(() => null);
      if (apps && !apps.apps.some((x) => x.id === appId)) {
        showToast({ tone: 'neutral', title: copy.appGone });
        return;
      }
    }
    if (a.kind === 'navigate') {
      setOpen(false);
      void navigate({ to: a.to });
    } else if (a.kind === 'mutation') {
      try {
        await runToastMutation(client, a.procedure as ToastMutation, a.input);
        showToast({ tone: 'success', title: a.done ?? toastCopy.done[a.procedure as ToastMutation] });
      } catch (err) {
        showToast({ tone: 'danger', title: errorLine(err) });
      }
    }
  };

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const today = items.filter((n) => isToday(n.createdAt, now));
  const earlier = items.filter((n) => !isToday(n.createdAt, now));

  const group = (label: string, rows: Notification[]) =>
    rows.length ? (
      <section aria-label={label} className="flex flex-col">
        <h3 className="m-0 px-3 pb-1 pt-2.5 text-caption font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </h3>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.map((n) => (
            <Item
              key={n.id}
              n={n}
              now={now}
              isAdmin={isAdmin}
              shippedPhase={shippedPhase}
              onAct={act}
              onDismiss={dismiss}
            />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="fixed right-4 top-4 z-40 flex flex-col items-end sm:right-8 sm:top-7">
      <button
        ref={bellRef}
        type="button"
        aria-label={copy.bell(unread)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="hl-focus relative grid size-11 place-items-center rounded-pill border border-border-glass bg-fill-primary text-ink-on-light shadow-menu"
      >
        <Bell aria-hidden {...iconDefaults} className="size-5" />
        {unread > 0 ? (
          <span aria-hidden className="hl-count -right-1 -top-1">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={copy.title}
          className="hl-glass hl-glass-3 hl-anim-panel mt-3 flex max-h-[min(640px,calc(100dvh-112px))] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-xl p-2.5 shadow-window"
        >
          <div className="flex items-center justify-between px-3 pb-1.5 pt-2">
            <h2 className="m-0 text-headline">{copy.title}</h2>
            <Button variant="link" disabled={unread === 0} onClick={() => void markRead('all')}>
              {copy.markAllRead}
            </Button>
          </div>
          {list.isError ? (
            <p className="m-0 px-3 py-4 text-body-sm text-ink-muted">
              {copy.couldntLoad}{' '}
              <Button variant="link" onClick={() => void list.refetch()}>
                {copy.retry}
              </Button>
            </p>
          ) : list.isSuccess && items.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-body text-ink-muted">{copy.empty}</p>
          ) : (
            <>
              {group(copy.today, today)}
              {group(copy.earlier, earlier)}
              {list.hasNextPage ? (
                <Button variant="link" className="self-center" onClick={() => void list.fetchNextPage()}>
                  {copy.showMore}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Item({
  n,
  now,
  isAdmin,
  shippedPhase,
  onAct,
  onDismiss,
}: {
  n: Notification;
  now: number;
  isAdmin: boolean;
  shippedPhase: number;
  onAct: (n: Notification, a: ToastAction) => void;
  onDismiss: (n: Notification) => void;
}) {
  const actions = visibleActions(actionsFromNotification(n.actions), { isAdmin, shippedPhase });
  const itemLink = actions.find((a) => a.kind === 'navigate' && a.item);
  const inline = actions.filter((a) => a !== itemLink);
  const unread = n.readAt === null;
  return (
    <li
      className={`group relative flex gap-3 rounded-md p-3 hover:bg-surface-row focus-within:bg-surface-row ${unread ? 'bg-accent-wash' : ''}`}
    >
      <SeverityIcon n={n} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6">
        {itemLink && itemLink.kind === 'navigate' ? (
          <Link
            to={itemLink.to}
            onClick={(e) => {
              e.preventDefault();
              onAct(n, itemLink);
            }}
            className="hl-focus text-body-sm font-semibold text-ink underline underline-offset-2"
          >
            {n.title}
          </Link>
        ) : (
          <span className="text-body-sm font-semibold">{n.title}</span>
        )}
        {n.body ? <span className="text-body-sm text-ink-muted">{n.body}</span> : null}
        <span className="flex flex-wrap items-center gap-x-1.5 text-caption text-ink-faint">
          <time dateTime={new Date(n.createdAt).toISOString()}>{notificationTime(n.createdAt, now)}</time>
          {inline.map((a) => (
            <span key={a.label} className="contents">
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => onAct(n, a)}
                className="hl-focus border-0 bg-transparent p-0 text-caption font-semibold text-accent-link"
              >
                {a.label}
              </button>
            </span>
          ))}
        </span>
      </div>
      {unread ? (
        <span className="absolute right-3 top-3.5 size-2 rounded-pill bg-accent group-hover:hidden group-focus-within:hidden">
          <span className="sr-only">{copy.unread}</span>
        </span>
      ) : null}
      <button
        type="button"
        aria-label={copy.dismiss(n.title)}
        onClick={() => onDismiss(n)}
        className="hl-focus absolute right-2 top-2 grid size-7 place-items-center rounded-pill border-0 bg-transparent text-ink-muted opacity-0 hover:bg-surface-control focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <X aria-hidden {...iconDefaults} className="size-3.5" />
      </button>
    </li>
  );
}
