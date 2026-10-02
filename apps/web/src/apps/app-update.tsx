// Updating an app to the store's newer version (US-APP-07, US-STORE-17), and the banner when an update didn't start
// and hlabs rolled it back. Until the Updates page ships (phase 7) the banner shows on the app's details page; data
// restore from the pre-update backup waits for backups (phase 5, D-036).
import type { AppDetail } from '@hlabs/api';
import { iconDefaults, RotateCcw, TriangleAlert, X } from '@hlabs/icons';
import { Button, IconButton } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Link } from '@tanstack/react-router';
import { appsCopy } from '../copy/apps';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { useActiveJobs } from '../settings/engine-restart';

const copy = appsCopy;

/** Starts an update, and (when `watching`) how far the one for this app has got: null when none runs. */
export function useAppUpdate(appId: string, watching = false) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const jobs = useActiveJobs(watching);
  const job = jobs.data?.items.find((j) => j.kind === 'app_update' && j.target === appId) ?? null;
  const start = useMutation({
    mutationFn: () => client.apps.update.mutate({ appId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId }) });
    },
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
    },
  });
  return { start, progress: job ? job.progress : null };
}

/** "Update" beside "<new version> available" (US-APP-07). */
export function UpdateButton({ app }: { app: AppDetail }) {
  const { start, progress } = useAppUpdate(app.id, !!app.latestVersion);
  if (!app.latestVersion || app.state !== 'running' || progress !== null) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      busy={start.isPending}
      disabled={start.isPending || !app.engineRunning}
      title={app.engineRunning ? undefined : copy.engineFirst}
      onClick={() => start.mutate()}
    >
      {copy.update}
    </Button>
  );
}

/** The update that rolled back (US-STORE-17): what happened, View log, Try again, and Dismiss for good. */
export function RolledBackBanner({ app }: { app: AppDetail }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const { start } = useAppUpdate(app.id);
  const dismiss = useMutation({
    mutationFn: (id: string) => client.notifications.markRead.mutate({ ids: [id] }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId: app.id }) }),
  });
  const r = app.rolledBack;
  if (!r) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-5 py-4"
    >
      {r.restored ? (
        <RotateCcw aria-hidden {...iconDefaults} className="mt-0.5 size-5 shrink-0 text-warning" />
      ) : (
        <TriangleAlert aria-hidden {...iconDefaults} className="mt-0.5 size-5 shrink-0 text-danger" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 text-body font-bold text-ink">
          {r.restored ? copy.rolledBackTitle(app.name) : copy.restoreFailedTitle(app.name)}
        </p>
        <p className="m-0 text-body-sm text-ink-muted">
          {r.restored ? copy.rolledBackBody(r.fromVersion) : copy.restoreFailedBody(r.fromVersion, r.toVersion)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/apps/$appId/logs"
          params={{ appId: app.id }}
          search={{ at: r.at }}
          className="hl-btn hl-btn-secondary hl-btn-sm hl-focus no-underline"
        >
          {copy.viewLog}
        </Link>
        {/* "Restore from backup" takes this place when going back failed, with backups (phase 5). */}
        {r.restored ? (
          <Button
            size="sm"
            variant="secondary"
            busy={start.isPending}
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {copy.tryAgain}
          </Button>
        ) : null}
        <IconButton label={copy.dismiss} onClick={() => dismiss.mutate(r.notificationId)}>
          <X aria-hidden {...iconDefaults} className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/** The banner on a store app's details page, for admins when it's installed (until the Updates page, phase 7). */
export function DetailsRolledBack({ appId, installed }: { appId: string; installed: boolean }) {
  const trpc = useTRPC();
  const me = useMe(installed);
  const admin = me.data?.role === 'admin';
  const enabled = installed && admin;
  const queryClient = useQueryClient();
  const app = useQuery({ ...trpc.apps.get.queryOptions({ appId }), enabled, retry: false });
  // An update settling (running again, or error) may bring the banner or change it.
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['app.stateChanged'] },
      {
        enabled,
        onData: ({ data: event }) => {
          if (event.type === 'app.stateChanged' && event.data.appId === appId) {
            void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId }) });
          }
        },
      },
    ),
  );
  return app.data ? <RolledBackBanner app={app.data} /> : null;
}
