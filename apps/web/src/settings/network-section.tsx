// Settings › Network & remote access, Home network (US-SYS-01): the local address (and its home.arpa name, D-105),
// HTTPS, web ports, the local DNS server (US-SYS-06) and every app's address. Follows app and system changes without
// polling.
import { AppLogo, appTileLook } from '@hlabs/icons';
import type { NetworkStatus } from '@hlabs/api';
import { isFeatureEnabled } from '@hlabs/shared';
import { Badge, Button, List, ListRow, tokens } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState, type ReactNode } from 'react';
import { CopyAddress } from '../apps/app-access';
import { networkCopy as copy } from '../copy/network';
import type { HomeApp } from '../home/home-app';
import { useTRPC } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { DnsServerRows } from './dns-server';
import { TailscaleRow, useRemoteStatus } from './remote-access';
import { SubnetRouterOption, SubnetRouterRows } from './subnet-router';
import { WebPortsDialog } from './web-ports-dialog';

const LOGO = tokens.SPACE_7;
/** Fallback ports (D-016): when hlabs is on one of these, the usual one was taken. */
const FALLBACK = { https: { port: 8443, usual: 443 }, http: { port: 8080, usual: 80 } } as const;

/** "HTTP 80 · HTTPS 8443 (443 is used by another program)" (US-SYS-05). */
export function portsLine(ports: NetworkStatus['ports']): string {
  const taken: number[] = [];
  if (ports.https === FALLBACK.https.port) taken.push(FALLBACK.https.usual);
  if (ports.http === FALLBACK.http.port) taken.push(FALLBACK.http.usual);
  const line = copy.ports(ports.http, ports.https);
  return taken.length ? `${line} (${taken.map((p) => copy.portTaken(p)).join(', ')})` : line;
}

const mono = (text: string) => <span className="font-mono">{text}</span>;
const bare = (url: string) => url.replace(/^https:\/\//, '');

function AddressLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hl-focus rounded-xs font-mono text-body-sm text-ink underline-offset-2 hover:underline"
    >
      {url}
    </a>
  );
}

function HomeNetwork({
  status,
  shippedPhase,
  onChangePorts,
}: {
  status: NetworkStatus;
  shippedPhase?: number;
  onChangePorts: () => void;
}) {
  const { home, ports } = status;
  return (
    <List label={copy.homeNetwork}>
      <ListRow
        title={copy.localAddress}
        subtitle={
          <span className="flex flex-col gap-0.5">
            {mono(bare(home.localAddress))}
            <span>{copy.dnsName(bare(home.dnsAddress))}</span>
            {home.published ? null : (
              <>
                {home.fallbackAddress ? <span>{copy.useInstead(home.fallbackAddress)}</span> : null}
                {home.lanAddresses.length ? <span>{copy.lanAddresses(home.lanAddresses.join(', '))}</span> : null}
              </>
            )}
          </span>
        }
        trailing={
          <span className="flex items-center gap-2">
            {home.published ? null : <Badge tone="warning">{copy.notPublished}</Badge>}
            {/* Renaming the server ships in phase 9 (D-036). */}
            {isFeatureEnabled('renameServer', shippedPhase) ? (
              <Button variant="secondary" size="sm">
                {copy.rename}
              </Button>
            ) : null}
          </span>
        }
      />
      <ListRow
        title={copy.https}
        subtitle={copy.httpsHint}
        trailing={
          // The certificate guide ships in phase 9 (D-036).
          isFeatureEnabled('certGuide', shippedPhase) ? (
            <Button variant="secondary" size="sm">
              {copy.getCertificate}
            </Button>
          ) : null
        }
      />
      <ListRow
        title={copy.webPorts}
        subtitle={portsLine(ports)}
        trailing={
          <Button variant="secondary" size="sm" onClick={onChangePorts}>
            {copy.change}
          </Button>
        }
      />
      <DnsServerRows dns={status.dns} />
    </List>
  );
}

function AppAddresses({ apps }: { apps: readonly HomeApp[] }) {
  const desktop = useIsDesktop();
  return (
    <List label={copy.appAddresses}>
      {apps.length === 0 ? (
        <ListRow
          title={copy.noApps}
          trailing={
            <Link to="/store" className="hl-focus rounded-xs text-body-sm font-semibold text-accent-link no-underline">
              {copy.openStore}
            </Link>
          }
        />
      ) : (
        [...apps]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((app) => {
            const look = appTileLook(app.name, app.icon, LOGO);
            return (
              <ListRow
                key={app.id}
                leading={
                  <AppLogo
                    decorative
                    name={app.name}
                    src={app.icon.logoUrl}
                    colors={look.colors}
                    fallbackIcon={look.fallbackIcon}
                    size={LOGO}
                    radius={tokens.SPACE_2}
                  />
                }
                title={app.name}
                // As drawn: the address on the right; under the name on a phone.
                subtitle={desktop ? undefined : <AddressLink url={app.urls.local} />}
                trailing={
                  <span className="flex items-center gap-3">
                    {desktop ? <AddressLink url={app.urls.local} /> : null}
                    <CopyAddress url={app.urls.local} />
                  </span>
                }
              />
            );
          })
      )}
    </List>
  );
}

/**
 * While connected (US-SYS-04): the dashboard's tailnet address and each app's, on its own tailnet port of the same name (D-110)
 * (D-012, D-102). No per-app names or sub-paths.
 */
function TailnetAddresses({ dashboard, apps }: { dashboard: string; apps: readonly HomeApp[] }) {
  const desktop = useIsDesktop();
  const row = (key: string, title: ReactNode, url: string, leading?: ReactNode) => (
    <ListRow
      key={key}
      leading={leading}
      title={title}
      subtitle={desktop ? undefined : <AddressLink url={url} />}
      trailing={
        <span className="flex items-center gap-3">
          {desktop ? <AddressLink url={url} /> : null}
          <CopyAddress url={url} />
        </span>
      }
    />
  );
  return (
    <>
      {row('dashboard', copy.dashboard, dashboard)}
      {[...apps]
        .filter((a) => a.urls.tailnet)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((app) => {
          const look = appTileLook(app.name, app.icon, LOGO);
          return row(
            app.id,
            app.name,
            app.urls.tailnet!,
            <AppLogo
              decorative
              name={app.name}
              src={app.icon.logoUrl}
              colors={look.colors}
              fallbackIcon={look.fallbackIcon}
              size={LOGO}
              radius={tokens.SPACE_2}
            />,
          );
        })}
    </>
  );
}

export function NetworkSection({ shippedPhase }: { shippedPhase?: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const status = useRemoteStatus();
  const [changing, setChanging] = useState(false);
  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  // Installs, uninstalls and the server coming back change the addresses (no polling).
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['app.stateChanged', 'system.status'] },
      {
        onData: () => {
          void queryClient.invalidateQueries({ queryKey: trpc.network.status.queryKey() });
          void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
        },
      },
    ),
  );

  if (status.isError) {
    return (
      <div role="alert" className="flex items-center gap-3 text-body">
        <span>{copy.loadFailed}</span>
        <Button variant="secondary" size="sm" onClick={() => void status.refetch()}>
          {copy.tryAgain}
        </Button>
      </div>
    );
  }
  if (!status.data) return null;
  const remote = status.data.remote;
  return (
    <div className="flex flex-col gap-6">
      <HomeNetwork status={status.data} shippedPhase={shippedPhase} onChangePorts={() => setChanging(true)} />
      <List label={copy.remoteAccess}>
        {remote.mode === 'subnetRouter' ? (
          <SubnetRouterRows status={status.data} />
        ) : (
          <>
            <TailscaleRow remote={remote} />
            {remote.state === 'connected' ? (
              remote.url ? (
                <TailnetAddresses dashboard={remote.url} apps={apps.data?.apps ?? []} />
              ) : null
            ) : remote.state !== 'waiting' ? (
              // Or a subnet router elsewhere reaches the home network (US-SYS-41, D-107).
              <SubnetRouterOption />
            ) : null}
          </>
        )}
      </List>
      {apps.data ? <AppAddresses apps={apps.data.apps} /> : null}
      {changing ? <WebPortsDialog onClose={() => setChanging(false)} /> : null}
    </div>
  );
}
