// Settings › Updates (SettingsUpdates): hlabs's own version and whether a newer one is out (US-SYS-24). "Check now"
// asks the update manifest and refreshes the store index; offline, a toast says so and the last result stays.
import { LogoMark } from '@hlabs/icons';
import { Button } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updatesCopy as copy } from '../copy/updates';
import { handledGlobally, pageQuery, showErrorToast } from '../lib/error-copy';
import { timeAgo } from '../lib/relative-time';
import { useNow } from '../lib/use-now';
import { useTRPC, useTRPCClient } from '../lib/trpc';

const LOGO = 32;

export function UpdatesSection() {
  return (
    <div className="flex flex-col gap-7">
      <HlabsUpdate />
    </div>
  );
}

function HlabsUpdate() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const now = useNow();
  const status = useQuery({ ...trpc.settings.updates.get.queryOptions(), retry: false, ...pageQuery });
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
        <p className="m-0 mt-1 text-caption text-ink-muted">{checked}</p>
      </div>
      <Button variant="secondary" busy={check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? copy.checking : copy.checkNow}
      </Button>
    </section>
  );
}
