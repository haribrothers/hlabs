// When another program holds hlabs's web port (US-SYS-42, D-122): what holds it, when hlabs can tell; a critical
// notification for admins while it lasts; and moving hlabs to the other port in one step.
import { getSetting, type HlabsDb } from '@hlabs/db';
import type { NotificationService } from '../notifications/service';
import { FALLBACK_PORTS } from '../onboarding/system-check';
import type { TailscaleClient } from '../tailscale/types';
import { setWebPorts } from './ports';
import type { PortHolder, PortProblem } from './service';

export const PORT_IN_USE_KIND = 'network.port_in_use';

/** Tailscale Serve, when it has an entry on the port that hlabs didn't make (D-103: hlabs never removes it). */
export async function tailscaleServeHolds(
  port: number,
  deps: { db: HlabsDb; tailscale: Pick<TailscaleClient, 'serveConfig'> },
): Promise<PortHolder> {
  const ours = getSetting(deps.db, 'remote').serve;
  const { config } = await deps.tailscale.serveConfig();
  return config.TCP?.[String(port)] && !ours.includes(port) ? 'tailscaleServe' : null;
}

/** The port hlabs would move to: 8443 for HTTPS, 8080 for HTTP (D-016). */
export function fallbackPortFor(db: HlabsDb, port: number): number {
  return port === getSetting(db, 'network').ports.http ? FALLBACK_PORTS.http : FALLBACK_PORTS.https;
}

/** Tells every admin while it lasts; marked read once hlabs serves again. */
export function notifyPortProblem(
  deps: { db: HlabsDb; notifications: Pick<NotificationService, 'create' | 'markKindRead'> },
  problem: PortProblem | null,
): void {
  if (!problem) {
    deps.notifications.markKindRead(PORT_IN_USE_KIND);
    return;
  }
  const other = fallbackPortFor(deps.db, problem.port);
  deps.notifications.create({
    userId: null,
    kind: PORT_IN_USE_KIND,
    target: String(problem.port),
    severity: 'critical',
    title: `hlabs can't use port ${problem.port}`,
    body:
      problem.heldBy === 'tailscaleServe'
        ? `Tailscale Serve is using it, so other devices can't reach hlabs. Use port ${other} instead, or turn off that Serve entry.`
        : `Another program is using it, so other devices can't reach hlabs. Use port ${other} instead, or quit that program.`,
    actions: [{ kind: 'navigate', to: '/settings/network' }],
  });
}

/** "Use port 8443" (the tray): the other port instead of the held one, checked and audited as Settings would. */
export async function useOtherPort(
  deps: { db: HlabsDb; portInUse: (port: number) => Promise<boolean>; apply: () => Promise<void> },
  problem: PortProblem,
): Promise<void> {
  const ports = getSetting(deps.db, 'network').ports;
  const other = fallbackPortFor(deps.db, problem.port);
  const next = problem.port === ports.http ? { ...ports, http: other } : { ...ports, https: other };
  await setWebPorts(deps, next, { userId: null, ip: null });
}
