// App settings › Access (US-APP-05): the app's address as a link with Copy, and its tailnet address once remote access
// ships (D-036) and is on. The address is the app's name, or `https://hlabs.local:<port>` while its name can't be
// published (the daemon decides, D-086).
import type { AppDetail } from '@hlabs/api';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, List, ListRow } from '@hlabs/ui';
import { appsCopy } from '../copy/apps';
import { showToast } from '../lib/toasts';

const copy = appsCopy;

function CopyAddress({ url }: { url: string }) {
  const copyIt = () =>
    navigator.clipboard.writeText(url).then(
      () => showToast({ tone: 'success', title: copy.addressCopied }),
      () => showToast({ tone: 'danger', title: copy.copyFailed }),
    );
  return (
    <Button size="sm" variant="secondary" aria-label={copy.copyAddress(url)} onClick={() => void copyIt()}>
      {copy.copy}
    </Button>
  );
}

export function AppAccess({ app, shippedPhase }: { app: AppDetail; shippedPhase?: number }) {
  const tailnet = isFeatureEnabled('remoteAccess', shippedPhase) ? app.urls.tailnet : null;
  return (
    <List label={copy.access}>
      <ListRow
        title={
          <a
            href={app.urls.local}
            target="_blank"
            rel="noopener noreferrer"
            className="hl-focus font-mono text-body-sm text-ink underline-offset-2 hover:underline"
          >
            {app.urls.local}
          </a>
        }
        trailing={<CopyAddress url={app.urls.local} />}
      />
      {tailnet ? (
        <ListRow
          title={copy.alsoOnTailnet}
          subtitle={<span className="font-mono">{tailnet}</span>}
          trailing={<CopyAddress url={tailnet} />}
        />
      ) : null}
    </List>
  );
}
