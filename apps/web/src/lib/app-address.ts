// Which of an app's addresses to open, from the name the dashboard itself was reached on: its tailnet address on the
// tailnet (US-SYS-04), its home.arpa name when the dashboard is on home.arpa (D-105), else its .local address.

export interface AppUrls {
  local: string;
  tailnet: string | null;
}

export function appAddress(urls: AppUrls, location: Pick<Location, 'hostname'> = window.location): string {
  if (location.hostname.endsWith('.ts.net') && urls.tailnet) return urls.tailnet;
  // `https://immich.hlabs.local` → `https://immich.hlabs.home.arpa`; an app on its own port keeps it.
  if (location.hostname.endsWith('.home.arpa'))
    return urls.local.replace(/^(https:\/\/[^/:]+)\.local(?=[:/]|$)/, '$1.home.arpa');
  return urls.local;
}
