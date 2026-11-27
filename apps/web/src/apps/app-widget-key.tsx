// App settings › Home widget (US-HOME-20, D-157): when an app's widget reads its API with a key made in the app, an
// admin adds it here. It goes to the keychain and never comes back to the browser; the row says whether it's set.
import type { AppDetail } from '@hlabs/api';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { Button, List, ListRow, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { widgetKeyCopy as copy } from '../copy/widget-key';
import { errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

export function AppWidgetKey({ app, shippedPhase = VISIBLE_PHASE }: { app: AppDetail; shippedPhase?: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const enabled = isFeatureEnabled('widgets', shippedPhase);
  const status = useQuery({ ...trpc.apps.widgetKey.queryOptions({ appId: app.id }), enabled, retry: false });
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: string | null) => client.apps.setWidgetKey.mutate({ appId: app.id, key: value }),
    onSuccess: (_ok, value) => {
      void queryClient.invalidateQueries({ queryKey: trpc.apps.widgetKey.queryKey({ appId: app.id }) });
      void queryClient.invalidateQueries({ queryKey: trpc.home.getWidgetData.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.home.listWidgets.queryKey() });
      setOpen(false);
      setKey('');
      showToast({ tone: 'success', title: value === null ? copy.removed : copy.saved });
    },
    onError: (err) => setError(errorLine(err)),
  });
  if (!enabled || !status.data?.needed) return null;
  const set = status.data.set;
  return (
    <List label={copy.section}>
      <ListRow
        title={copy.apiKey}
        subtitle={set ? copy.added(app.name) : copy.notAdded}
        trailing={
          <div className="flex gap-2">
            {set ? (
              <Button variant="secondary" size="sm" onClick={() => save.mutate(null)} busy={save.isPending}>
                {copy.remove}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              {set ? copy.change : copy.add}
            </Button>
          </div>
        }
      />
      <ModalDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setError(null);
        }}
        title={copy.dialogTitle(app.name)}
        width={480}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button busy={save.isPending} disabled={!key.trim()} onClick={() => save.mutate(key.trim())}>
              {copy.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {status.data.help ? <p className="m-0 text-body text-ink-muted">{status.data.help}</p> : null}
          <TextField
            label={copy.apiKey}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError(null);
            }}
            hint={copy.keptWhere}
            error={error ?? undefined}
          />
        </div>
      </ModalDialog>
    </List>
  );
}
