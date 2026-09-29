// Where to go after logging in (US-AUTH-03, US-AUTH-05, US-AUTH-18): a path on this dashboard, or an https address
// whose origin the daemon allows (the dashboard, an installed app's hostname, the tailnet name or an app's tailnet
// port). Never another site, never the log-in page itself. Shared by the daemon and the dashboard.
export const NEXT_MAX_LENGTH = 2048;

/**
 * `allowedOrigins`: https origins (`https://immich.hlabs.local`, `https://hlabs.tail1234.ts.net:12001`) that `next`
 * may point to. Without it, only paths are kept.
 */
export function safeNext(next: string | undefined | null, allowedOrigins?: ReadonlySet<string>): string {
  if (!next || next.length > NEXT_MAX_LENGTH) return '/';
  if (next.startsWith('/')) {
    if (next.startsWith('//') || next.startsWith('/\\')) return '/';
    if (next === '/login' || next.startsWith('/login/') || next.startsWith('/login?')) return '/';
    return next;
  }
  if (!allowedOrigins || !next.startsWith('https://')) return '/';
  try {
    const url = new URL(next);
    if (url.protocol !== 'https:' || url.username || url.password) return '/';
    return allowedOrigins.has(url.origin) ? url.href : '/';
  } catch {
    return '/';
  }
}

/** The https origins `next` may use (US-AUTH-18). */
export function nextOrigins(opts: {
  /** The dashboard's own address (config), when it is https. */
  dashboardUrl: string;
  /** The machine's name: `hlabs` → `hlabs.local`. */
  hostname: string;
  /** Installed apps: hostname label and tailnet/fallback port. */
  apps: ReadonlyArray<{ hostname: string; port: number | null }>;
  /** The tailnet's DNS name (`tail1234` or `tail1234.ts.net`) when remote access is on. */
  tailnet: string | null;
}): Set<string> {
  const origins = new Set<string>();
  const local = `${opts.hostname}.local`;
  origins.add(`https://${local}`);
  try {
    const dashboard = new URL(opts.dashboardUrl);
    if (dashboard.protocol === 'https:') origins.add(dashboard.origin);
  } catch {
    // Not a URL: nothing to add.
  }
  for (const app of opts.apps) origins.add(`https://${app.hostname}.${local}`);
  if (opts.tailnet) {
    const tailnetHost = `${opts.hostname}.${opts.tailnet.replace(/\.ts\.net$/, '')}.ts.net`;
    origins.add(`https://${tailnetHost}`);
    for (const app of opts.apps) if (app.port !== null) origins.add(`https://${tailnetHost}:${app.port}`);
  }
  return origins;
}
