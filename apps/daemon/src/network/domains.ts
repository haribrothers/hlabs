// The names hlabs answers on at home (D-105): `<host>.local`, published with mDNS, and `<host>.home.arpa`, for DNS
// servers (RFC 8375, D-106). Apps are `<app>.<host>.local` and `<app>.<host>.home.arpa`.

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
