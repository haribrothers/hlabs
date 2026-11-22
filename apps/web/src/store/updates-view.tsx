// The App Store's Updates (StoreUpdates; US-STORE-15, US-STORE-16), admins only. Each app with a newer version: "<old>
// → <new> · released 2 days ago", "What's new" (the notes open in the row, "Hide notes" closes them) and Update, which
// shows the update's progress; an update asking for new access says so, and Review lists only what's new. "Update all
// (N)" in the header queues them all in list order and counts "Updating 1 of 2…". Without updates: "All apps are up to
// date", when hlabs last checked and "Check now". Then the updates of the last 14 days and where to turn off the
// backup before an update.
import type { StoreUpdates } from '@hlabs/api';
import { AppLogo, appTileLook } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { Button, ModalDialog, Progress, tokens } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { lazy, Suspense, useId, useState } from 'react';
import { storeUpdatesCopy as copy } from '../copy/store-updates';
import { handledGlobally, pageQuery, showErrorToast } from '../lib/error-copy';
import { daysAgo, timeAgo } from '../lib/relative-time';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useNow } from '../lib/use-now';
import { StoreView } from './store-layout';

const Readme = lazy(() => import('./readme'));
/** The rows' logos, as the screen draws them (52 px). */
const LOGO = tokens.SIZE_DOCK_TILE - tokens.SPACE_1;

type Pending = StoreUpdates['pending'][number];
type Recent = StoreUpdates['recent'][number];

function Logo({ name, icon }: { name: string; icon: Pending['icon'] }) {
  const look = appTileLook(name, icon, LOGO);
  return (
    <AppLogo
      decorative
      name={name}
      src={icon.logoUrl}
      colors={look.colors}
      fallbackIcon={look.fallbackIcon}
      size={LOGO}
      style={{ boxShadow: 'var(--shadow-icon)' }}
    />
  );
}

const rowList = 'm-0 list-none overflow-hidden rounded-xl bg-surface-row p-0';
const row = 'flex flex-col gap-3 border-b border-hairline px-5 py-4 last:border-b-0';

function UpdateRow({
  app,
  now,
  progress,
  rolledBack,
  starting,
  busy,
  onUpdate,
  onReview,
}: {
  app: Pending;
  now: number;
  progress: number | null;
  rolledBack: boolean;
  starting: boolean;
  busy: boolean;
  onUpdate: () => void;
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const notesId = useId();
  return (
    <li className={row}>
      {/* The buttons go under the text when there isn't room beside it (a phone). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Logo name={app.name} icon={app.icon} />
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
          <span className="text-headline font-bold">{app.name}</span>
          <span className="text-body-sm text-ink-muted">
            {copy.versions(app.fromVersion, app.toVersion, daysAgo(app.releasedAt, now))}
          </span>
          {app.newAccess ? (
            <span className="flex flex-wrap items-center gap-x-2 text-body-sm font-semibold text-warning">
              {copy.needsApproval}
              <Button variant="link" size="sm" aria-label={copy.reviewApp(app.name)} onClick={onReview}>
                {copy.review}
              </Button>
            </span>
          ) : null}
        </div>
        {progress !== null ? (
          <div className="ml-auto flex w-40 min-w-0 flex-col gap-1.5" aria-live="polite">
            <span className="text-body-sm text-ink-muted">{copy.updating}</span>
            <Progress value={progress} aria-label={copy.updatingApp(app.name)} />
          </div>
        ) : (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {rolledBack ? (
              <Link
                to="/store/app/$appId"
                params={{ appId: app.appId }}
                aria-label={copy.rolledBackLabel(app.name)}
                className="hl-focus rounded-xs text-body-sm font-semibold text-warning no-underline hover:underline"
              >
                {copy.rolledBack}
              </Link>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={open}
              aria-controls={notesId}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? copy.hideNotes : copy.whatsNew}
            </Button>
            <Button size="sm" busy={starting} disabled={busy} aria-label={copy.updateApp(app.name)} onClick={onUpdate}>
              {copy.update}
            </Button>
          </div>
        )}
      </div>
      {open ? (
        <div
          id={notesId}
          role="region"
          aria-label={copy.notesOf(app.name)}
          className="md:ml-[calc(var(--size-dock-tile)-var(--space-1)+var(--space-4))] rounded-md bg-scrim px-4 py-3 text-body-sm"
        >
          {app.releaseNotes ? (
            <Suspense fallback={null}>
              <Readme markdown={app.releaseNotes} />
            </Suspense>
          ) : (
            <p className="m-0 text-ink-muted">{copy.noNotes}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function RecentRow({ app, now }: { app: Recent; now: number }) {
  const parts = [
    copy.updatedWhen(daysAgo(app.at, now)),
    ...(app.automatic ? [copy.automatically] : []),
    ...(app.notBackedUp ? [copy.notBackedUp] : []),
  ];
  return (
    <li className={row}>
      <div className="flex items-center gap-4">
        <Logo name={app.name} icon={app.icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-headline font-bold">{app.name}</span>
          <span className="text-body-sm text-ink-muted">{parts.join(' · ')}</span>
        </div>
        <span className="shrink-0 text-body-sm text-ink-muted">{app.version}</span>
      </div>
    </li>
  );
}

/** Review (US-STORE-16): only the access the new version adds. */
function ReviewAccess({ app, onClose }: { app: Pending | null; onClose: () => void }) {
  const access = app?.newAccess;
  const perms = access
    ? [
        ...(access.permissions.network ? [copy.network[access.permissions.network]] : []),
        ...(access.permissions.gpu ? [copy.gpu] : []),
        ...(access.permissions.dockerSocket ? [copy.dockerSocket] : []),
      ]
    : [];
  const section = (title: string, items: string[]) =>
    items.length ? (
      <section className="flex flex-col gap-1.5">
        <h3 className="hl-list-label m-0">{title}</h3>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <ModalDialog
      open={app !== null}
      onOpenChange={(o) => (o ? null : onClose())}
      sheetOnPhone
      title={app ? copy.reviewTitle(app.name, app.toVersion) : ''}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {copy.close}
        </Button>
      }
    >
      {access ? (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-body text-ink-muted">{copy.reviewIntro}</p>
          {section(
            copy.folders,
            access.folders.map((f) => (f.mode === 'rw' ? copy.folderWrite(f.label) : copy.folderRead(f.label))),
          )}
          {section(
            copy.ports,
            access.ports.map((p) => copy.port(p.label, p.host, p.protocol)),
          )}
          {section(copy.permissions, perms)}
        </div>
      ) : null}
    </ModalDialog>
  );
}

export function StoreUpdatesView({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const updates = useQuery({ ...trpc.store.listUpdates.queryOptions(), retry: false, ...pageQuery });
  // Its one event stream (below) keeps the jobs fresh too.
  const jobs = useQuery({ ...trpc.jobs.list.queryOptions(), retry: false });
  const now = useNow().getTime();
  const [review, setReview] = useState<Pending | null>(null);
  /** "Update all": its jobs and how many have finished. */
  const [batch, setBatch] = useState<{ jobIds: string[]; finished: number } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.store.listUpdates.queryKey() });

  useEventStream((event) => {
    if (event.type === 'job.progress' || event.type === 'job.finished')
      void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
    if (event.type === 'app.updatesAvailable') refresh();
    if (event.type === 'job.finished' && event.data.kind === 'app_update') {
      refresh();
      setBatch((b) => {
        if (!b?.jobIds.includes(event.data.jobId)) return b;
        const finished = b.finished + 1;
        return finished >= b.jobIds.length ? null : { ...b, finished };
      });
    }
  });
  const onError = (err: unknown) => {
    if (!handledGlobally(err)) showErrorToast(err);
  };
  const started = () => void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
  const start = useMutation({
    mutationFn: (appId: string) => client.apps.update.mutate({ appId }),
    onSuccess: started,
    onError,
  });
  const startAll = useMutation({
    mutationFn: () => client.apps.updateAll.mutate(),
    onSuccess: ({ jobIds }) => {
      setBatch(jobIds.length ? { jobIds, finished: 0 } : null);
      started();
    },
    onError,
  });
  const check = useMutation({
    mutationFn: () => client.settings.updates.check.mutate(),
    onSettled: refresh,
    onError,
  });

  const u = updates.data;
  const pending = u?.pending ?? [];
  const progressOf = (appId: string) => {
    const job = jobs.data?.items.find((j) => j.kind === 'app_update' && j.target === appId);
    return job ? job.progress : null;
  };
  const updating = batch !== null || startAll.isPending;
  const canUpdateAll = isFeatureEnabled('updateAll', shippedPhase) && pending.length > 0;
  const action = canUpdateAll ? (
    <Button busy={startAll.isPending} disabled={updating} onClick={() => startAll.mutate()}>
      {batch
        ? copy.updatingOf(Math.min(batch.finished + 1, batch.jobIds.length), batch.jobIds.length)
        : copy.updateAll(pending.length)}
    </Button>
  ) : null;
  const rolledBack = new Set(u?.rolledBack.map((r) => r.appId));

  return (
    <StoreView title={copy.title} action={action}>
      {u ? (
        <div className="flex flex-col gap-6 pb-6">
          {pending.length ? (
            <ul aria-label={copy.title} className={rowList}>
              {pending.map((app) => (
                <UpdateRow
                  key={app.appId}
                  app={app}
                  now={now}
                  progress={progressOf(app.appId)}
                  rolledBack={rolledBack.has(app.appId)}
                  starting={start.isPending && start.variables === app.appId}
                  busy={start.isPending || updating}
                  onUpdate={() => start.mutate(app.appId)}
                  onReview={() => setReview(app)}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-row px-5 py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-headline font-bold">{copy.upToDate}</span>
                <span className="text-body-sm text-ink-muted">
                  {u.lastCheckedAt ? copy.checked(timeAgo(u.lastCheckedAt, now)) : copy.neverChecked}
                </span>
              </div>
              <Button variant="secondary" size="sm" busy={check.isPending} onClick={() => check.mutate()}>
                {copy.checkNow}
              </Button>
            </div>
          )}

          {u.recent.length ? (
            <section aria-labelledby="recently-updated" className="flex flex-col gap-3">
              <h2 id="recently-updated" className="m-0 text-title-2">
                {copy.recent}
              </h2>
              <ul aria-labelledby="recently-updated" className={rowList}>
                {u.recent.map((app) => (
                  <RecentRow key={app.appId} app={app} now={now} />
                ))}
              </ul>
            </section>
          ) : null}

          <p className="m-0 text-body-sm text-ink-muted">
            {copy.footer}
            <Link
              to="/settings/$section"
              params={{ section: 'updates' }}
              className="hl-focus rounded-xs font-bold text-accent no-underline hover:underline"
            >
              {copy.footerLink}
            </Link>
            .
          </p>
        </div>
      ) : null}
      <ReviewAccess app={review} onClose={() => setReview(null)} />
    </StoreView>
  );
}
