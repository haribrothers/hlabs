// App updates in Settings › Updates (US-SYS-25): each installed app with a newer version, "<old> → <new>", its
// release notes ("What's new") and "Update", which shows the update's progress; an app that updated drops off, one
// that rolled back says "Rolled back" and links to what happened (the app's page, US-STORE-17). "Update all" (phase 7)
// queues them all, one at a time (US-STORE-15).
import type { StoreUpdates } from '@hlabs/api';
import { AppLogo, appTileLook } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, List, ListRow, ModalDialog, PillButton, Progress, tokens } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { updatesCopy as copy } from '../copy/updates';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useIsDesktop } from '../lib/use-media';
import { useActiveJobs } from './engine-restart';

const Readme = lazy(() => import('../store/readme'));
const LOGO = tokens.SPACE_7;
/** On a phone, 36 px (PhoneRedesignA_Updates). */
const PHONE_LOGO = tokens.SPACE_7 + tokens.SPACE_2;

type Pending = StoreUpdates['pending'][number];

export function AppUpdates() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const updates = useQuery({ ...trpc.store.listUpdates.queryOptions(), retry: false });
  const jobs = useActiveJobs();
  const [notes, setNotes] = useState<Pending | null>(null);
  useEventStream((event) => {
    if (event.type === 'job.finished' && event.data.kind === 'app_update') {
      void queryClient.invalidateQueries({ queryKey: trpc.store.listUpdates.queryKey() });
    }
  });
  const start = useMutation({
    mutationFn: (appId: string) => client.apps.update.mutate({ appId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() }),
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
    },
  });

  const startAll = useMutation({
    mutationFn: () => client.apps.updateAll.mutate(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() }),
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
    },
  });

  const desktop = useIsDesktop();
  const u = updates.data;
  if (!u) return null;
  const anyUpdating = jobs.data?.items.some((j) => j.kind === 'app_update') ?? false;
  const rolledBack = new Set(u.rolledBack.map((r) => r.appId));
  const progressOf = (appId: string) =>
    jobs.data?.items.find((j) => j.kind === 'app_update' && j.target === appId)?.progress ?? null;

  const notesDialog = (
    <ModalDialog
      open={notes !== null}
      onOpenChange={(open) => (open ? null : setNotes(null))}
      sheetOnPhone
      title={notes ? copy.whatsNewTitle(notes.name, notes.toVersion) : ''}
      actions={
        <Button variant="secondary" onClick={() => setNotes(null)}>
          {copy.close}
        </Button>
      }
    >
      {notes?.releaseNotes ? (
        <Suspense fallback={null}>
          <Readme markdown={notes.releaseNotes} />
        </Suspense>
      ) : (
        <p className="m-0 text-body text-ink-muted">{copy.noNotes}</p>
      )}
    </ModalDialog>
  );
  const canUpdateAll = isFeatureEnabled('updateAll') && u.pending.length > 1;

  if (!desktop)
    // PhoneRedesignA_Updates (US-PHONE-27): "App updates · 2" with "Update all" at its right, then each app with its
    // version, "What's new" and an Update pill.
    return (
      <section aria-labelledby="app-updates" className="hl-p-group-wrap">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 id="app-updates" className="hl-p-label m-0 ml-4">
            {u.pending.length ? copy.appUpdates(u.pending.length) : copy.appUpdatesTitle}
          </h2>
          {canUpdateAll ? (
            <button
              type="button"
              className="hl-p-tbtn hl-focus -mr-2"
              aria-busy={startAll.isPending || undefined}
              disabled={anyUpdating || startAll.isPending}
              onClick={() => startAll.mutate()}
            >
              {copy.updateAll}
            </button>
          ) : null}
        </div>
        <ul className="hl-p-group">
          {u.pending.length === 0 ? (
            <li className="hl-p-row text-ink-muted">{copy.allAppsUpToDate}</li>
          ) : (
            u.pending.map((app) => {
              const look = appTileLook(app.name, app.icon, PHONE_LOGO);
              const progress = progressOf(app.appId);
              const starting = start.isPending && start.variables === app.appId;
              return (
                <li key={app.appId} className="hl-p-row">
                  <AppLogo
                    decorative
                    name={app.name}
                    src={app.icon.logoUrl}
                    colors={look.colors}
                    fallbackIcon={look.fallbackIcon}
                    size={PHONE_LOGO}
                    radius={tokens.SPACE_2}
                  />
                  <span className="hl-p-row-main">
                    <span className="hl-p-row-text">
                      <span className="hl-p-row-title">{app.name}</span>
                      <span className="hl-p-row-sub">
                        {copy.versions(app.fromVersion, app.toVersion)} ·{' '}
                        <button type="button" className="hl-p-urow-link hl-focus" onClick={() => setNotes(app)}>
                          {copy.whatsNew}
                        </button>
                        {rolledBack.has(app.appId) ? (
                          <>
                            {' · '}
                            <Link
                              to="/store/app/$appId"
                              params={{ appId: app.appId }}
                              aria-label={copy.rolledBackLabel(app.name)}
                              className="hl-p-urow-link hl-focus text-warning"
                            >
                              {copy.rolledBack}
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </span>
                    {progress !== null ? (
                      <Progress className="w-24 min-w-0" value={progress} aria-label={copy.updatingApp(app.name)} />
                    ) : (
                      <PillButton
                        aria-busy={starting || undefined}
                        disabled={start.isPending}
                        aria-label={`${copy.update} ${app.name}`}
                        onClick={() => start.mutate(app.appId)}
                      >
                        {copy.update}
                      </PillButton>
                    )}
                  </span>
                </li>
              );
            })
          )}
        </ul>
        {notesDialog}
      </section>
    );

  return (
    <section aria-labelledby="app-updates" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="app-updates" className="hl-list-label m-0">
          {u.pending.length ? copy.appUpdates(u.pending.length) : copy.appUpdatesTitle}
        </h2>
        {canUpdateAll ? (
          <Button
            size="sm"
            variant="secondary"
            busy={startAll.isPending}
            disabled={anyUpdating}
            onClick={() => startAll.mutate()}
          >
            {copy.updateAll}
          </Button>
        ) : null}
      </div>
      {u.pending.length === 0 ? (
        <p className="m-0 rounded-lg bg-surface-row px-4 py-3 text-body-sm text-ink-muted">{copy.allAppsUpToDate}</p>
      ) : (
        <List>
          {u.pending.map((app) => {
            const look = appTileLook(app.name, app.icon, LOGO);
            const progress = progressOf(app.appId);
            const starting = start.isPending && start.variables === app.appId;
            return (
              <ListRow
                key={app.appId}
                leading={
                  <AppLogo
                    decorative
                    name={app.name}
                    src={app.icon.logoUrl}
                    colors={look.colors}
                    fallbackIcon={look.fallbackIcon}
                    size={LOGO}
                    radius={tokens.SPACE_2}
                  />
                }
                title={app.name}
                subtitle={copy.versions(app.fromVersion, app.toVersion)}
                trailing={
                  progress !== null ? (
                    <Progress className="w-32 min-w-0" value={progress} aria-label={copy.updatingApp(app.name)} />
                  ) : (
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      {rolledBack.has(app.appId) ? (
                        <Link
                          to="/store/app/$appId"
                          params={{ appId: app.appId }}
                          aria-label={copy.rolledBackLabel(app.name)}
                          className="hl-focus rounded-xs text-body-sm font-semibold text-warning no-underline hover:underline"
                        >
                          {copy.rolledBack}
                        </Link>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => setNotes(app)}>
                        {copy.whatsNew}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        busy={starting}
                        disabled={start.isPending}
                        aria-label={`${copy.update} ${app.name}`}
                        onClick={() => start.mutate(app.appId)}
                      >
                        {copy.update}
                      </Button>
                    </span>
                  )
                }
              />
            );
          })}
        </List>
      )}
      {notesDialog}
    </section>
  );
}
