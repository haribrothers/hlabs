// App updates in Settings › Updates (US-SYS-25): each installed app with a newer version, "<old> → <new>", its
// release notes ("What's new") and "Update", which shows the update's progress; an app that updated drops off, one
// that rolled back says "Rolled back" and links to what happened (the app's page, US-STORE-17). "Update all" waits
// for phase 7 (D-036).
import type { StoreUpdates } from '@hlabs/api';
import { AppLogo, appTileLook } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, List, ListRow, ModalDialog, Progress, tokens } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { updatesCopy as copy } from '../copy/updates';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useActiveJobs } from './engine-restart';

const Readme = lazy(() => import('../store/readme'));
const LOGO = tokens.SPACE_7;

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

  const u = updates.data;
  if (!u) return null;
  const rolledBack = new Set(u.rolledBack.map((r) => r.appId));
  const progressOf = (appId: string) =>
    jobs.data?.items.find((j) => j.kind === 'app_update' && j.target === appId)?.progress ?? null;

  return (
    <section aria-labelledby="app-updates" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="app-updates" className="hl-list-label m-0">
          {u.pending.length ? copy.appUpdates(u.pending.length) : copy.appUpdatesTitle}
        </h2>
        {isFeatureEnabled('updateAll') && u.pending.length > 1 ? (
          <Button size="sm" variant="secondary">
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
    </section>
  );
}
