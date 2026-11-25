// Account › Signed-in devices (US-ACCT-04, US-ACCT-05): each live session as "<device> · <browser>" over
// "<network> · <last seen>", this device first.
import { Laptop, Smartphone, Tablet, MonitorSmartphone, iconDefaults } from '@hlabs/icons';
import { Badge, Button, InsetGroup, InsetRow, List, ListRow } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountCopy } from '../copy/account';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { useNow } from '../lib/use-now';
import { describeDevice, lastSeen, networkOf, type DeviceKind } from './devices';

const copy = accountCopy;
const ICONS: Record<DeviceKind, typeof Laptop> = {
  computer: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  unknown: MonitorSmartphone,
};

/** Sign out another device (US-ACCT-05): the row goes when it's done; if it fails, the row stays and a toast says so. */
function SignOut({ sessionId, device, phone }: { sessionId: string; device: string; phone?: boolean }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => client.auth.revokeSession.mutate({ sessionId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.auth.listSessions.queryKey() });
      showToast({ tone: 'success', title: copy.signedOut(device) });
    },
    onError: () => showToast({ tone: 'danger', title: copy.signOutFailed(device) }),
  });
  // A phone: red text at the end of the row (PhoneRedesignA_Account).
  if (phone)
    return (
      <button
        type="button"
        className="hl-p-link hl-focus text-danger"
        disabled={revoke.isPending}
        aria-busy={revoke.isPending || undefined}
        aria-label={copy.signOutDevice(device)}
        onClick={() => revoke.mutate()}
      >
        {copy.signOut}
      </button>
    );
  return (
    <Button
      variant="secondary"
      size="sm"
      busy={revoke.isPending}
      aria-label={copy.signOutDevice(device)}
      onClick={() => revoke.mutate()}
    >
      {copy.signOut}
    </Button>
  );
}

export function SignedInDevices() {
  const trpc = useTRPC();
  const now = useNow().getTime();
  const sessions = useQuery({ ...trpc.auth.listSessions.queryOptions(), retry: false });
  const desktop = useIsDesktop();
  if (!sessions.data) return null;
  if (!desktop)
    return (
      <InsetGroup role="group" label={copy.devices}>
        {sessions.data.items.map((s) => {
          const { device, browser, kind } = describeDevice(s.userAgent);
          const Icon = ICONS[kind];
          return (
            <InsetRow
              key={s.id}
              icon={<Icon aria-hidden {...iconDefaults} />}
              title={copy.deviceLine(device, browser)}
              subtitle={
                s.publicHost
                  ? copy.publicSeenLine(s.publicHost, lastSeen(s.lastSeenAt, now))
                  : copy.seenLine(copy.networks[networkOf(s.ip)], lastSeen(s.lastSeenAt, now))
              }
              value={s.current ? copy.thisDevice : undefined}
              trailing={s.current ? undefined : <SignOut sessionId={s.id} device={device} phone />}
            />
          );
        })}
      </InsetGroup>
    );
  return (
    <List label={copy.devices}>
      {sessions.data.items.map((s) => {
        const { device, browser, kind } = describeDevice(s.userAgent);
        const Icon = ICONS[kind];
        return (
          <ListRow
            key={s.id}
            leading={<Icon aria-hidden {...iconDefaults} />}
            title={copy.deviceLine(device, browser)}
            subtitle={
              s.publicHost
                ? copy.publicSeenLine(s.publicHost, lastSeen(s.lastSeenAt, now))
                : copy.seenLine(copy.networks[networkOf(s.ip)], lastSeen(s.lastSeenAt, now))
            }
            trailing={s.current ? <Badge>{copy.thisDevice}</Badge> : <SignOut sessionId={s.id} device={device} />}
          />
        );
      })}
    </List>
  );
}
