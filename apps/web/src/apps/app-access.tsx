// App settings › Access (US-APP-05): the app's address as a link with Copy, and its tailnet address once remote access
// ships (D-036) and is on. The address is the app's name, or `https://hlabs.local:<port>` while its name can't be
// published (the daemon decides, D-086). "Require hlabs login" (US-APP-19) puts the hlabs sign-in in front of the app or
// takes it away (asking first), at once, with "Uses its own login too" for an app that has accounts of its own.
import type { AppDetail } from '@hlabs/api';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, List, ListRow, ModalDialog, Switch } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { appsCopy } from '../copy/apps';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { showToast } from '../lib/toasts';

const copy = appsCopy;

export function CopyAddress({ url }: { url: string }) {
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
      {isFeatureEnabled('appPermissions', shippedPhase) ? <RequireLogin app={app} /> : null}
    </List>
  );
}

/** "Require hlabs login": on adds forward auth at once; off asks first, then drops it (no restart, audited). */
function RequireLogin({ app }: { app: AppDetail }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const key = trpc.apps.get.queryKey({ appId: app.id });
  const [asking, setAsking] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const save = useMutation({
    mutationFn: (mode: 'hlabs' | 'none') => client.apps.setAuthMode.mutate({ appId: app.id, mode }),
    onMutate: async (mode) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => (old ? { ...old, authMode: mode } : old));
      return { before };
    },
    onError: (err, _mode, context) => {
      queryClient.setQueryData(key, context?.before);
      if (!handledGlobally(err)) showErrorToast(err);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: trpc.apps.getConfig.queryKey({ appId: app.id }) });
    },
  });
  const hint = app.ownLogin ? `${copy.requireLoginHint} · ${copy.ownLoginToo}` : copy.requireLoginHint;
  return (
    <>
      <ListRow
        title={copy.requireLogin}
        subtitle={hint}
        trailing={
          <Switch
            aria-label={copy.requireLogin}
            checked={app.authMode === 'hlabs'}
            disabled={save.isPending}
            onChange={(on) => (on ? save.mutate('hlabs') : setAsking(true))}
          />
        }
      />
      <ModalDialog
        open={asking}
        onOpenChange={setAsking}
        title={copy.loginOffTitle(app.name)}
        description={copy.loginOffBody(app.urls.local, app.name)}
        initialFocus={cancel}
        sheetOnPhone
        actions={
          <>
            <Button ref={cancel} variant="secondary" onClick={() => setAsking(false)}>
              {copy.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setAsking(false);
                save.mutate('none');
              }}
            >
              {copy.turnOff}
            </Button>
          </>
        }
      />
    </>
  );
}
