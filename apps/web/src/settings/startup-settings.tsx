// Startup (US-SYS-20): start at login (the tray applies it, D-042; hidden until the tray ships in phase 4 and on a
// headless Linux server), start apps automatically, and keep this computer awake. A switch that fails to save flips
// back and says so.
import { isFeatureEnabled } from '@hlabs/shared';
import { List, ListRow, Switch } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { engineCopy } from '../copy/engine';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

const copy = engineCopy;
type Key = 'startAtLogin' | 'autostartApps' | 'keepAwake';

export function StartupSettings() {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery({ ...trpc.settings.get.queryOptions(), retry: false });
  const tray = isFeatureEnabled('tray');
  const info = useQuery({ ...trpc.system.info.queryOptions(), enabled: tray, retry: false });
  const key = trpc.settings.get.queryKey();

  const save = useMutation({
    mutationFn: (change: Partial<Record<Key, boolean>>) => client.settings.startup.update.mutate(change),
    // Show the new value at once; put the old one back if saving fails.
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => (old ? { ...old, startup: { ...old.startup, ...change } } : old));
      return { before };
    },
    onError: (_err, _change, context) => {
      queryClient.setQueryData(key, context?.before);
      showToast({ tone: 'danger', title: copy.saveFailed });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  if (!settings.data) return null;
  const s = settings.data.startup;
  const showStartAtLogin = tray && info.data?.os.headless === false;
  const row = (k: Key, title: string, note: string) => (
    <ListRow
      title={title}
      subtitle={note}
      trailing={<Switch checked={s[k]} aria-label={title} onChange={(next) => save.mutate({ [k]: next })} />}
    />
  );
  return (
    <List label={copy.startup}>
      {showStartAtLogin ? row('startAtLogin', copy.startAtLogin, copy.startAtLoginNote) : null}
      {row('autostartApps', copy.autostartApps, copy.autostartAppsNote)}
      {row('keepAwake', copy.keepAwake, copy.keepAwakeNote)}
    </List>
  );
}
