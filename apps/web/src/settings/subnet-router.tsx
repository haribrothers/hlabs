// Remote access through a Tailscale subnet router (US-SYS-41, D-107): hlabs leaves Tailscale on this computer alone
// and lists the addresses that work from the tailnet: the LAN IP, and the home.arpa name once a local DNS server keeps
// it (US-SYS-06). Invite and reset links use the home-network address (D-109).
import type { NetworkStatus } from '@hlabs/api';
import { Network, iconDefaults } from '@hlabs/icons';
import { helpUrl } from '@hlabs/shared';
import { Button, ListRow } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyAddress } from '../apps/app-access';
import { networkCopy as copy } from '../copy/network';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';

/** The dashboard's addresses from the tailnet: `https://<LAN IP>[:port]`, and `https://<host>.home.arpa[:port]`. */
export function subnetAddresses(status: Pick<NetworkStatus, 'home' | 'ports' | 'dns'>): string[] {
  const port = status.ports.https === 443 ? '' : `:${status.ports.https}`;
  const lan = status.home.lanAddresses[0];
  return [...(lan ? [`https://${lan}${port}`] : []), ...(status.dns.kind === 'none' ? [] : [status.home.dnsAddress])];
}

function useSetMode() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: 'off' | 'subnetRouter') => client.network.setRemoteMode.mutate({ mode }),
    meta: { inlineErrors: true },
    onSuccess: async (_ok, mode) => {
      await queryClient.invalidateQueries({ queryKey: trpc.network.status.queryKey() });
      if (mode === 'subnetRouter') showToast({ tone: 'success', title: copy.subnetSaved });
    },
    onError: () => showToast({ tone: 'danger', title: copy.modeFailed }),
  });
}

function RouterIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-control text-ink">
      <Network aria-hidden {...iconDefaults} size={18} />
    </span>
  );
}

/** Offered beside Connect while remote access isn't connected. */
export function SubnetRouterOption() {
  const setMode = useSetMode();
  const desktop = useIsDesktop();
  const button = (
    <Button
      variant="secondary"
      size={desktop ? 'sm' : 'md'}
      busy={setMode.isPending}
      onClick={() => setMode.mutate('subnetRouter')}
    >
      {copy.useSubnetRouter}
    </Button>
  );
  return (
    <ListRow
      leading={<RouterIcon />}
      title={copy.subnetOption}
      subtitle={copy.subnetOptionHint}
      trailing={desktop ? button : undefined}
      below={desktop ? undefined : button}
    />
  );
}

/** Remote access in subnet router mode: the addresses that work from away, each with Copy, and how to set it up. */
export function SubnetRouterRows({ status }: { status: NetworkStatus }) {
  const setMode = useSetMode();
  const desktop = useIsDesktop();
  const addresses = subnetAddresses(status);
  const back = (
    <Button
      variant="secondary"
      size={desktop ? 'sm' : 'md'}
      busy={setMode.isPending}
      onClick={() => setMode.mutate('off')}
    >
      {copy.useTailscaleHere}
    </Button>
  );
  return (
    <>
      <ListRow
        leading={<RouterIcon />}
        title={<span className="font-semibold">{copy.throughSubnetRouter}</span>}
        subtitle={copy.throughSubnetRouterHint}
        // hlabs can't see the router, so no "Connected" here: just the way back.
        trailing={desktop ? back : undefined}
        below={desktop ? undefined : back}
      />
      {addresses.length === 0 ? <ListRow title={copy.dashboard} subtitle={copy.noLanAddress} /> : null}
      {addresses.map((url) => (
        <ListRow
          key={url}
          title={copy.dashboard}
          subtitle={<span className="font-mono break-words">{url}</span>}
          trailing={<CopyAddress url={url} />}
        />
      ))}
      <ListRow
        title={copy.subnetHelp}
        trailing={
          <a
            href={helpUrl('remote-access/subnet-router')}
            target="_blank"
            rel="noopener noreferrer"
            className="hl-focus rounded-xs whitespace-nowrap text-body-sm font-semibold text-accent-link no-underline"
          >
            {copy.openHelp}
          </a>
        }
      />
    </>
  );
}
