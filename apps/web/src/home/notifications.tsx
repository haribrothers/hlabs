// The bell on Home and its panel (US-HOME-13, 14; HomeNotifications): how many are new, the list grouped "Today" and
// "Earlier", each with what to do about it; reading, acting on and dismissing them. New ones arrive on the event
// stream; marking read is optimistic and rolls back if the daemon refuses.
import type { Notification } from '@hlabs/api';
import { Bell, Check, CircleX, Download, iconDefaults, Info, Lock, TriangleAlert, X } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE, type ToastMutation } from '@hlabs/shared';
import { BottomSheet, Button, SheetHeader, useIsPhone, useIsTouch } from '@hlabs/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { useEventStream } from '../lib/use-event-stream';
import { useAppOverlay } from '../apps/app-overlay';
import { useHistoryLayer } from '../lib/history-layer';

const PAGE = 50;

/** The tile beside each item: what kind of news it is, never by colour alone. */
function SeverityIcon({ n, phone = false }: { n: Notification; phone?: boolean }) {
  const props = { ...iconDefaults, 'aria-hidden': true as const, className: phone ? 'size-4.5' : 'size-4' };
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
    <span
      className={`grid shrink-0 place-items-center ${phone ? 'hl-p-sq' : 'size-9 rounded-sm bg-surface-control'} ${tone}`}
    >
      {icon}
    </span>
  );
}

/** The app an action is about, if it names one: `/apps/<id>/…` or a mutation's `appId`. */
function appOf(a: ToastAction): string | null {
  if (a.kind === 'navigate') return /^\/apps\/([^/]+)/.exec(a.to)?.[1] ?? null;
  if (a.kind === 'mutation') return typeof a.input.appId === 'string' ? a.input.appId : null;
  return null;
}

/**
 * `shippedPhase`: the phase whose controls show (tests set it; D-036). `inline`: in PhoneHome's header beside the
 * greeting, with a dot for what's new and the list as a bottom sheet (US-PHONE-07); otherwise in Home's top right
 * corner with its panel under it.
 */
export function NotificationsBell({
  shippedPhase = VISIBLE_PHASE,
  inline = false,
  trailing,
}: {
  shippedPhase?: number;
  inline?: boolean;
  /** Beside the bell in the corner: Edit Home on a tablet (TabletHome, US-TAB-01). */
  trailing?: ReactNode;
}) {
  if (!isFeatureEnabled('notifications', shippedPhase))
    return trailing ? <div className="fixed right-4 top-4 z-40 flex sm:right-8 sm:top-7">{trailing}</div> : null;
  return <Panel shippedPhase={shippedPhase} inline={inline} trailing={trailing} />;
}

function Panel({ shippedPhase, inline, trailing }: { shippedPhase: number; inline: boolean; trailing?: ReactNode }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const overlay = useAppOverlay();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const now = useNow().getTime();
  const [open, setOpen] = useState(false);
  // A bottom sheet on a phone, which Back closes (US-PHONE-03, US-PHONE-04).
  const sheet = useIsPhone();
  // On a tablet the bell is a glass circle with a dot, as on a phone (TabletHome).
  const touch = useIsTouch();
  const round = inline || touch;
  const closeSheet = useHistoryLayer('notifications', open && sheet, () => setOpen(false), sheet);
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
  useEventStream((event) => {
    if (event.type === 'notification.created') {
      queryClient.setQueryData(countKey, (c) => (c ? { count: c.count + 1 } : c));
    } else if (event.type !== 'notification.read' && event.type !== 'notification.dismissed') return;
    refresh();
  });

  // Escape or a click outside closes it, and focus goes back to the bell. The sheet does that itself.
  useEffect(() => {
    if (!open || sheet) return;
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
  }, [open, sheet]);

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
      if (sheet) await closeSheet();
      else setOpen(false);
      // An app's settings or logs open over the page (D-166); anything else navigates.
      overlay.follow(a.to);
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
    rows.length && sheet ? (
      // PhoneRedesignA_Notifications: "Today" and "Earlier" over inset boxes of rows.
      <section aria-label={label} className="hl-p-group-wrap">
        <h3 className="hl-p-label">{label}</h3>
        <ul className="hl-p-group">
          {rows.map((n) => (
            <Item
              key={n.id}
              n={n}
              now={now}
              isAdmin={isAdmin}
              shippedPhase={shippedPhase}
              onAct={act}
              onDismiss={dismiss}
              phone
            />
          ))}
        </ul>
      </section>
    ) : rows.length ? (
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

  const markAll = (
    <Button variant="link" disabled={unread === 0} onClick={() => void markRead('all')}>
      {copy.markAllRead}
    </Button>
  );
  const body = list.isError ? (
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
  );

  const bell = (
    <button
      ref={bellRef}
      type="button"
      aria-label={copy.bell(unread)}
      aria-expanded={open}
      aria-controls={open && !sheet ? panelId : undefined}
      aria-haspopup="dialog"
      onClick={() => setOpen((o) => !o)}
      className={
        round
          ? 'hl-p-ibtn hl-focus'
          : 'hl-focus relative grid size-11 place-items-center rounded-pill border border-border-glass bg-fill-primary text-ink-on-light shadow-menu'
      }
    >
      <Bell aria-hidden {...iconDefaults} className="size-5" />
      {unread > 0 ? (
        round ? (
          // A dot on a phone, as PhoneHome draws it; the label says how many.
          <span aria-hidden className="hl-p-dot" />
        ) : (
          <span aria-hidden className="hl-count -right-1 -top-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )
      ) : null}
    </button>
  );

  if (sheet)
    // PhoneRedesignA_Notifications (US-PHONE-27): a full-height sheet named like a page, "Mark all read" and "✕"
    // beside its title, then the groups.
    return (
      <>
        {bell}
        <BottomSheet
          open={open}
          onOpenChange={(o) => (o ? setOpen(true) : void closeSheet())}
          titled
          full
          closeButton={false}
        >
          <SheetHeader
            large
            title={copy.title}
            trailing={
              <button
                type="button"
                className="hl-p-tbtn hl-focus"
                disabled={unread === 0}
                onClick={() => void markRead('all')}
              >
                {copy.markAllRead}
              </button>
            }
            onClose={() => void closeSheet()}
          />
          <div className="hl-sheet-scroll flex flex-col gap-5 pb-6">{body}</div>
        </BottomSheet>
      </>
    );

  return (
    <div className={inline ? 'flex' : 'fixed right-4 top-4 z-40 flex flex-col items-end sm:right-8 sm:top-7'}>
      {trailing ? (
        <div className="flex gap-2.5">
          {bell}
          {trailing}
        </div>
      ) : (
        bell
      )}
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={copy.title}
          className="hl-glass hl-glass-3 hl-anim-panel mt-3 flex max-h-[min(640px,calc(100dvh-112px))] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl p-2.5 shadow-window"
        >
          <div className="flex items-center justify-between px-3 pb-1.5 pt-2">
            <h2 className="m-0 text-headline">{copy.title}</h2>
            {markAll}
          </div>
          {/* Only the list scrolls, with a thin scrollbar inside the panel's rounded edge. */}
          <div className="hl-scroll -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{body}</div>
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
  phone = false,
}: {
  /** A row of the phone's sheet (PhoneRedesignA_Notifications). */
  phone?: boolean;
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
  const title =
    itemLink && itemLink.kind === 'navigate' ? (
      <Link
        to={itemLink.to}
        onClick={(e) => {
          e.preventDefault();
          onAct(n, itemLink);
        }}
        className="hl-focus hl-p-note-title text-ink underline underline-offset-2"
      >
        {n.title}
      </Link>
    ) : (
      <span className="hl-p-note-title">{n.title}</span>
    );
  if (phone)
    return (
      <li className="hl-p-note">
        <SeverityIcon n={n} phone />
        <div className="hl-p-note-main">
          <div className="flex items-start gap-2">
            {title}
            <time className="hl-p-note-time" dateTime={new Date(n.createdAt).toISOString()}>
              {notificationTime(n.createdAt, now)}
            </time>
            {unread ? (
              <span className="hl-p-note-dot">
                <span className="sr-only">{copy.unread}</span>
              </span>
            ) : null}
          </div>
          {n.body ? <p className="hl-p-note-body">{n.body}</p> : null}
          {inline.length ? (
            <span className="flex flex-wrap gap-x-4">
              {inline.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => onAct(n, a)}
                  className="hl-p-link hl-focus font-semibold"
                >
                  {a.label}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={copy.dismiss(n.title)}
          onClick={() => onDismiss(n)}
          className="hl-p-note-dismiss hl-focus"
        >
          <X aria-hidden {...iconDefaults} />
        </button>
      </li>
    );
  return (
    <li
      className={`group relative flex gap-3 rounded-md p-3 hover:bg-surface-row focus-within:bg-surface-row ${unread ? 'bg-accent-wash' : ''}`}
    >
      <SeverityIcon n={n} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6 [@media(hover:none)]:pr-14">
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
        <span className="absolute right-3 top-3.5 size-2 rounded-pill bg-accent group-hover:hidden group-focus-within:hidden [@media(hover:none)]:right-12 [@media(hover:none)]:block">
          <span className="sr-only">{copy.unread}</span>
        </span>
      ) : null}
      <button
        type="button"
        aria-label={copy.dismiss(n.title)}
        onClick={() => onDismiss(n)}
        className="hl-focus hl-hover-reveal absolute right-0 top-0 grid size-11 place-items-center rounded-pill border-0 bg-transparent text-ink-muted opacity-0 hover:bg-surface-control focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 md:right-2 md:top-2 md:size-7"
      >
        <X aria-hidden {...iconDefaults} className="size-3.5" />
      </button>
    </li>
  );
}
