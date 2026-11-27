// InstallFailed as a bottom sheet on a phone (US-PHONE-12): an install started from this phone's install sheet stays
// on the page it was started from; if it fails, the sheet says why in the same words as the install's page
// (US-STORE-13), with Try again and the way to the full page and its other fixes.
import { Button, ModalDialog } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { installCopy } from '../copy/install';
import { showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useAppDetails } from './app-details';
import { failureReason } from './install-progress';
import { unwatch, useWatched, watchInstall } from './install-watch';

const copy = installCopy;

/** Mounted once in the phone's shell. */
export function PhoneInstallFailed() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const ids = useWatched();
  const [failed, setFailed] = useState<string | null>(null);
  const check = async (appId: string) => {
    const app = await client.apps.get.query({ appId }).catch(() => null);
    if (!app || app.state === 'installing') return;
    unwatch(appId);
    if (app.state === 'install_failed') setFailed(appId);
  };
  useEventStream((event) => {
    if (event.type === 'app.stateChanged' && ids.includes(event.data.appId)) {
      void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
      void check(event.data.appId);
    } else if (event.type === 'job.finished' && event.data.kind === 'app_install' && event.data.target) {
      if (ids.includes(event.data.target)) void check(event.data.target);
    }
  });
  if (!failed) return null;
  return <FailedSheet appId={failed} onClose={() => setFailed(null)} />;
}

function FailedSheet({ appId, onClose }: { appId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const app = useQuery({ ...trpc.apps.get.queryOptions({ appId }), retry: false });
  const details = useAppDetails(appId);
  const retry = useMutation({
    mutationFn: () => client.apps.retryInstall.mutate({ appId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
      watchInstall(appId);
      onClose();
    },
    onError: (err) => showErrorToast(err),
  });
  if (!app.data || !details.data) return null;
  const name = details.data.app.name;
  return (
    <ModalDialog
      open
      onOpenChange={(o) => (o ? undefined : onClose())}
      role="alertdialog"
      title={copy.failedTitle(name)}
      description={failureReason(app.data.stateDetail, name, details.data.host.os)}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              void navigate({ to: '/store/install/$appId', params: { appId } });
            }}
          >
            {copy.seeDetails}
          </Button>
          <Button busy={retry.isPending} onClick={() => retry.mutate()}>
            {copy.tryAgain}
          </Button>
        </>
      }
    >
      <p className="m-0 text-body-sm text-ink-muted">{copy.nothingChanged}</p>
    </ModalDialog>
  );
}
