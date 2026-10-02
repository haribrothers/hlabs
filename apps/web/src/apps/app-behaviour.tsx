// App settings › Behaviour (US-APP-06): "Start automatically", and "Update automatically" once app updates ship in
// phase 7 (D-036); "Include in backups" waits for backups in phase 5. A switch saves at once and flips back, with
// the reason in a toast, when saving fails.
import type { AppDetail } from '@hlabs/api';
import { isFeatureEnabled } from '@hlabs/shared';
import { List, ListRow, Switch } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appsCopy } from '../copy/apps';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';

const copy = appsCopy;
type Setting = 'autostart' | 'autoUpdate';

export function AppBehaviour({ app, shippedPhase }: { app: AppDetail; shippedPhase?: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const key = trpc.apps.get.queryKey({ appId: app.id });

  const save = useMutation({
    mutationFn: ({ setting, enabled }: { setting: Setting; enabled: boolean }) =>
      setting === 'autostart'
        ? client.apps.setAutostart.mutate({ appId: app.id, enabled })
        : client.apps.setAutoUpdate.mutate({ appId: app.id, enabled }),
    // Show the new value at once; put the old one back if saving fails.
    onMutate: async ({ setting, enabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => (old ? { ...old, [setting]: enabled } : old));
      return { before };
    },
    onError: (err, _change, context) => {
      queryClient.setQueryData(key, context?.before);
      if (!handledGlobally(err)) showErrorToast(err);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const row = (setting: Setting, title: string, opts: { disabled?: boolean; note?: string } = {}) => (
    <ListRow
      title={title}
      subtitle={opts.note}
      trailing={
        <Switch
          checked={app[setting]}
          aria-label={title}
          disabled={opts.disabled}
          onChange={(enabled) => save.mutate({ setting, enabled })}
        />
      }
    />
  );
  return (
    <List label={copy.behaviour}>
      {row('autostart', copy.startAutomatically)}
      {isFeatureEnabled('appUpdates', shippedPhase)
        ? row('autoUpdate', copy.updateAutomatically, {
            disabled: app.custom,
            note: app.custom ? copy.customNeverUpdates : undefined,
          })
        : null}
    </List>
  );
}
