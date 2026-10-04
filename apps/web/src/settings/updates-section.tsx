// Settings › Updates (SettingsUpdates): hlabs's own version and whether a newer one is out (US-SYS-24). "Check now"
// asks the update manifest and refreshes the store index; offline, a toast says so and the last result stays. A newer
// version has its notes, "Full release notes" and "Update now" (US-SYS-23), which starts the update unless another
// job has to finish first ("Wait for … to finish"); the page then shows that hlabs is updating (US-STATE-01).
import { LogoMark } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, List, ListRow, Switch } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updatesCopy as copy } from '../copy/updates';
import { handledGlobally, pageQuery, showErrorToast } from '../lib/error-copy';
import { timeAgo } from '../lib/relative-time';
import { showToast } from '../lib/toasts';
import { useNow } from '../lib/use-now';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { AppUpdates } from './app-updates';

const LOGO = 32;

export function UpdatesSection() {
  return (
    <div className="flex flex-col gap-7">
      <HlabsUpdate />
      <AppUpdates />
      <AutomaticUpdates />
    </div>
  );
}

type Auto = { hlabs: boolean; apps: boolean; backupBeforeUpdate: boolean };

/**
 * The overnight switches (US-SYS-26): hlabs, and apps that allow it, between 3 and 5 am. "Back up app data before
 * updating" waits for backups (phase 5, D-036). A switch that fails to save flips back and says so.
 */
function AutomaticUpdates() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const key = trpc.settings.updates.get.queryKey();
  const status = useQuery({ ...trpc.settings.updates.get.queryOptions(), retry: false });
  const save = useMutation({
    mutationFn: (next: Auto) => client.settings.updates.setAuto.mutate(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) =>
        old ? { ...old, autoHlabs: next.hlabs, autoApps: next.apps, backupBeforeUpdate: next.backupBeforeUpdate } : old,
      );
      return { before };
    },
    onError: (err, _next, context) => {
      queryClient.setQueryData(key, context?.before);
      if (!handledGlobally(err)) showToast({ tone: 'danger', title: copy.saveFailed });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const s = status.data;
  if (!s) return null;
  const current: Auto = { hlabs: s.autoHlabs, apps: s.autoApps, backupBeforeUpdate: s.backupBeforeUpdate };
  const row = (k: keyof Auto, title: string, note: string) => (
    <ListRow
      title={title}
      subtitle={note}
      trailing={
        <Switch checked={current[k]} aria-label={title} onChange={(on) => save.mutate({ ...current, [k]: on })} />
      }
    />
  );
  return (
    <section aria-label={copy.automatic}>
      <List label={copy.automatic}>
        {row('hlabs', copy.autoHlabs, copy.autoHlabsNote)}
        {row('apps', copy.autoApps, copy.autoAppsNote)}
        {isFeatureEnabled('backups') ? row('backupBeforeUpdate', copy.backupFirst, copy.backupFirstNote) : null}
      </List>
    </section>
  );
}

function HlabsUpdate() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const now = useNow();
  const status = useQuery({ ...trpc.settings.updates.get.queryOptions(), retry: false, ...pageQuery });
  // A job starting or finishing can block or free "Update now".
  useEventStream((event) => {
    if (event.type === 'job.finished' || (event.type === 'job.progress' && event.data.progress === 0)) {
      void queryClient.invalidateQueries({ queryKey: trpc.settings.updates.get.queryKey() });
    }
  });
  const install = useMutation({
    mutationFn: () => client.settings.updates.install.mutate(),
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
      void queryClient.invalidateQueries({ queryKey: trpc.settings.updates.get.queryKey() });
    },
  });
  const check = useMutation({
    mutationFn: () => client.settings.updates.check.mutate(),
    onSuccess: (next) => {
      queryClient.setQueryData(trpc.settings.updates.get.queryKey(), next);
      // The store index was refreshed too: its updates (and the App Store's badge) may have changed.
      void queryClient.invalidateQueries({ queryKey: trpc.store.listUpdates.queryKey() });
    },
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
    },
  });

  const s = status.data;
  if (!s) return null;
  const checked =
    s.lastCheckedAt === null ? copy.neverChecked : copy.lastChecked(timeAgo(s.lastCheckedAt, now.getTime()));
  const available = s.available;
  return (
    <section
      aria-labelledby="hlabs-update-title"
      className={`flex flex-wrap items-start gap-4 rounded-lg border p-5 ${
        available ? 'border-accent bg-accent-wash' : 'border-hairline bg-surface-row'
      }`}
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-md bg-surface-control p-1.5"
        aria-hidden="true"
      >
        <LogoMark size={LOGO} title="" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="hlabs-update-title" className="m-0 text-body font-bold">
          {available ? copy.available(available.version) : copy.upToDate}
        </h2>
        <p className="m-0 text-body-sm text-ink-muted">
          {available ? copy.youHave(s.version) : copy.versionLine(s.version)}
        </p>
        {available && available.notes.length ? (
          <ul className="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-body-sm">
            {available.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <p className="m-0 mt-1 flex flex-wrap gap-x-3 text-caption text-ink-muted">
          <span>{checked}</span>
          {available ? (
            <a
              href={available.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hl-focus rounded-xs text-accent-link underline-offset-2 hover:underline"
            >
              {copy.fullNotes}
            </a>
          ) : null}
        </p>
      </div>
      {available ? (
        <div className="flex flex-col items-end gap-2">
          <Button
            busy={install.isPending || install.isSuccess}
            disabled={!!s.blockedBy}
            aria-describedby={s.blockedBy ? 'hlabs-update-wait' : undefined}
            onClick={() => install.mutate()}
          >
            {install.isPending || install.isSuccess ? copy.starting : copy.updateNow}
          </Button>
          {s.blockedBy ? (
            <p id="hlabs-update-wait" className="m-0 text-caption text-ink-muted">
              {copy.waitFor(copy.jobName(s.blockedBy))}
            </p>
          ) : null}
        </div>
      ) : (
        <Button variant="secondary" busy={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? copy.checking : copy.checkNow}
        </Button>
      )}
    </section>
  );
}
