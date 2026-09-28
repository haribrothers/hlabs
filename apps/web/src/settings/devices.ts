// How a signed-in device is described (US-ACCT-04): device and browser from the user agent only (hlabs doesn't
// know machine names), the network from the IP address, and when it was last seen.
import { accountCopy } from '../copy/account';
import { timeAgo } from '../lib/relative-time';

export type DeviceKind = 'phone' | 'tablet' | 'computer' | 'unknown';

export function describeDevice(userAgent: string | null): { device: string; browser: string; kind: DeviceKind } {
  const ua = userAgent ?? '';
  const [device, kind]: [string, DeviceKind] = /iPhone/.test(ua)
    ? ['iPhone', 'phone']
    : /iPad/.test(ua)
      ? ['iPad', 'tablet']
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? ['Android phone', 'phone']
          : ['Android tablet', 'tablet']
        : /Macintosh|Mac OS X/.test(ua)
          ? ['Mac', 'computer']
          : /Windows/.test(ua)
            ? ['Windows PC', 'computer']
            : /Linux|X11|CrOS/.test(ua)
              ? ['Linux PC', 'computer']
              : [accountCopy.unknownDevice, 'unknown'];
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Version\/[\d.]+.*Safari\//.test(ua)
            ? 'Safari'
            : accountCopy.unknownBrowser;
  return { device, browser, kind };
}

const v4 = (ip: string) => {
  const m = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i.exec(ip);
  return m ? m.slice(1).map(Number) : null;
};

export type NetworkKind = keyof typeof accountCopy.networks;

/** Tailscale's 100.64.0.0/10 (and its IPv6 range); private LAN ranges; this computer; else the internet. */
export function networkOf(ip: string | null): NetworkKind {
  if (!ip) return 'internet';
  const a = v4(ip);
  if (a) {
    const [o1, o2] = a as [number, number];
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return 'tailscale';
    if (o1 === 127) return 'local';
    if (o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168)) return 'home';
    if (o1 === 169 && o2 === 254) return 'home';
    return 'internet';
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1') return 'local';
  if (v6.startsWith('fd7a:115c:a1e0:')) return 'tailscale';
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return 'home';
  return 'internet';
}

/** "active now" within 5 minutes, then "2 hours ago". */
export function lastSeen(at: number, now = Date.now()): string {
  return now - at < 5 * 60_000 ? accountCopy.activeNow : timeAgo(at, now);
}
