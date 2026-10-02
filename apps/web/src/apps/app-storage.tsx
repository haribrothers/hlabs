// App settings › Storage and resources, and the version (US-APP-07). "Data folder" is where the app keeps its data
// ("Move…" comes with moving app data in phase 8); "Using now" is its disk use, with live CPU and memory once usage
// monitoring ships in phase 4 (D-036). The footer says whether a newer version is in the store.
import type { AppDetail } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { List, ListRow } from '@hlabs/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { appsCopy } from '../copy/apps';
import { useTRPC } from '../lib/trpc';

const copy = appsCopy;
/** How soon to ask again while the first disk count is still going. */
const RECOUNT_MS = 3_000;

export function AppStorage({ app }: { app: AppDetail }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The daemon counts in the background; ask again until it has the answer.
  useEffect(() => {
    if (app.disk) return;
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId: app.id }) }),
      RECOUNT_MS,
    );
    return () => clearTimeout(timer);
  }, [app.disk, app.id, queryClient, trpc]);

  const size = app.disk ? formatBytes(app.disk.dataBytes + app.disk.imageBytes) : null;
  const using = size === null ? copy.countingDisk : app.state === 'stopped' ? copy.stoppedDisk(size) : copy.disk(size);
  return (
    <List label={copy.storage}>
      <ListRow
        title={copy.dataFolder}
        trailing={
          <span title={app.dataFolder} className="max-w-2/3 min-w-0 truncate font-mono text-body-sm text-ink-muted">
            {app.dataFolder}
          </span>
        }
      />
      <ListRow title={copy.usingNow} trailing={<span className="text-body-sm text-ink-muted">{using}</span>} />
    </List>
  );
}

/** "Version 2.4.1 · up to date", or the version the store has. */
export function AppVersion({ app }: { app: AppDetail }) {
  return (
    <p className="m-0 text-body-sm text-ink-muted">
      {app.latestVersion ? copy.updateAvailable(app.version, app.latestVersion) : copy.upToDate(app.version)}
    </p>
  );
}
