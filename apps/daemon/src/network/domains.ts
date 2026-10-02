// The names hlabs answers on at home (D-105): `<host>.local`, published with mDNS, and `<host>.home.arpa`, for DNS
// servers (RFC 8375, D-106). Apps are `<app>.<host>.local` and `<app>.<host>.home.arpa`. On the tailnet, the
// computer's own name (D-102).
import { getSetting, type HlabsDb } from '@hlabs/db';

/** The home-network domains for a server name, mDNS first. */
export const homeDomains = (hostname: string): [local: string, dns: string] => [
  `${hostname}.local`,
  `${hostname}.home.arpa`,
];

/** An app's names under each home domain. */
export const appHosts = (appHostname: string, hostname: string): string[] =>
  homeDomains(hostname).map((d) => `${appHostname}.${d}`);

/** The app hostname a host names (`immich.hlabs.local`, `immich.hlabs.home.arpa` → `immich`), or null. */
export function appHostnameIn(host: string, hostname: string): string | null {
  for (const domain of homeDomains(hostname)) {
    const suffix = `.${domain}`;
    if (host.endsWith(suffix)) return host.slice(0, -suffix.length) || null;
  }
  return null;
}

/** Which home domain a host is on (`hlabs.home.arpa`, `x.hlabs.home.arpa` → the home.arpa one), else `.local`. */
export function homeDomainOf(host: string, hostname: string): string {
  const [local, dns] = homeDomains(hostname);
  const bare = host.replace(/:\d+$/, '').toLowerCase();
  return bare === dns || bare.endsWith(`.${dns}`) ? dns : local;
}

/**
 * `<node>.<tailnet>.ts.net` when remote access is set up: this computer's own name on the tailnet (D-102), or the
 * machine's name until it's known.
 */
export function tailnetHost(db: HlabsDb): string | null {
  const remote = getSetting(db, 'remote');
  const tailnet = remote.tailnetName?.replace(/\.ts\.net$/, '');
  return tailnet ? `${remote.nodeName ?? getSetting(db, 'hostname')}.${tailnet}.ts.net` : null;
}

/** The dashboard's tailnet address, with its port when it isn't 443 (D-103). */
export function tailnetDashboardUrl(db: HlabsDb): string | null {
  const host = tailnetHost(db);
  const port = getSetting(db, 'remote').dashboardPort;
  return host ? `https://${host}${port === 443 ? '' : `:${port}`}` : null;
}
