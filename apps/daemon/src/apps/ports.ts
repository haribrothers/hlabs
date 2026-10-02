// Each app gets one port from 12000–12999: its LAN fallback port, which Caddy serves (its tailnet port is 2000 above,
// D-110). Its web service is published for Caddy on 127.0.0.1:<port + 1000>, in 13000–13999, so Caddy can listen on
// the app's own port on every address (D-049, D-086).
import { hlabsError } from '@hlabs/api';
import { createServer } from 'node:net';

export const APP_PORT_MIN = 12000;
export const APP_PORT_MAX = 12999;
/** How far the loopback range sits above the app ports (D-086). */
export const LOOPBACK_OFFSET = 1000;

/** Where an app's web service listens on this computer, for Caddy and health checks. */
export const loopbackPort = (appPort: number) => appPort + LOOPBACK_OFFSET;

/** True when nothing listens on 127.0.0.1:<port>. */
export function loopbackPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** The lowest app port from `from` up that no app holds and whose loopback port nothing listens on. */
export async function allocatePort(
  taken: Iterable<number>,
  isFree: (port: number) => Promise<boolean> = loopbackPortFree,
  from: number = APP_PORT_MIN,
): Promise<number> {
  const held = new Set(taken);
  for (let port = Math.max(from, APP_PORT_MIN); port <= APP_PORT_MAX; port++) {
    if (!held.has(port) && (await isFree(loopbackPort(port)))) return port;
  }
  throw hlabsError('APP_PORT_IN_USE', 'No free port in 12000–12999');
}
