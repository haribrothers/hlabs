// Which of an app's addresses to open, from the name the dashboard itself was reached on: its tailnet address on the
// tailnet (US-SYS-04), its own port at this computer's address (US-SYS-41), its home.arpa name when the dashboard is on
// home.arpa (D-105), else its .local address.

export interface AppUrls {
  local: string;
  tailnet: string | null;
  port: number | null;
}

/** An IPv4 address, or an IPv6 one as the URL writes it (`[fd00::1]`). */
const isAddress = (hostname: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');

export function appAddress(urls: AppUrls, location: Pick<Location, 'hostname'> = window.location): string {
  if (location.hostname.endsWith('.ts.net') && urls.tailnet) return urls.tailnet;
  // At this computer's address (through a subnet router, US-SYS-41): the app on its own port there.
  if (isAddress(location.hostname) && urls.port !== null) return `https://${location.hostname}:${urls.port}`;
  // `https://immich.hlabs.local` → `https://immich.hlabs.home.arpa`; an app on its own port keeps it.
  if (location.hostname.endsWith('.home.arpa'))
    return urls.local.replace(/^(https:\/\/[^/:]+)\.local(?=[:/]|$)/, '$1.home.arpa');
  return urls.local;
}
