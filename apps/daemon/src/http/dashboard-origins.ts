// The web addresses the dashboard is served from, which session mutations must come from (07 §7.3). They follow the
// name on the network and the web ports as they are now, so renaming hlabs during setup (D-098) or moving ports doesn't
// leave the dashboard refused as a cross-site request.
import { getSetting, type HlabsDb } from '@hlabs/db';
import { homeDomains } from '../network/domains';
import { tailnetHost } from '../network/service';

const withPort = (scheme: 'https' | 'http', host: string, port: number) =>
  `${scheme}://${host}${port === (scheme === 'https' ? 443 : 80) ? '' : `:${port}`}`;

/** hlabs on the home network over HTTPS (`https://hlabs.local`, with the port when 443 was taken, D-016). */
export function lanDashboardOrigin(db: HlabsDb): string {
  return withPort('https', homeDomains(getSetting(db, 'hostname'))[0], getSetting(db, 'network').ports.https);
}

/**
 * `configured` (HLABS_DASHBOARD_URL: the tray's loopback address, or Vite in development), hlabs's own name over HTTPS,
 * over plain HTTP while setup runs (D-013), and the tailnet address once remote access is on.
 */
export function dashboardOrigins(configured: string, db: HlabsDb | null): string[] {
  const origins = [new URL(configured).origin];
  if (!db) return origins;
  origins.push(lanDashboardOrigin(db));
  // Its name for DNS servers too (D-105).
  origins.push(withPort('https', homeDomains(getSetting(db, 'hostname'))[1], getSetting(db, 'network').ports.https));
  const host = `${getSetting(db, 'hostname')}.local`;
  if (getSetting(db, 'onboarding').completedAt === null)
    origins.push(withPort('http', host, getSetting(db, 'network').ports.http));
  const tailnet = tailnetHost(db);
  if (tailnet) origins.push(`https://${tailnet}`);
  return [...new Set(origins)];
}
