// Each app gets one port from 12000–12999: its web service is published on 127.0.0.1:<port> for Caddy (D-049), and
// the same number is its tailnet port (D-012).
import { hlabsError } from '@hlabs/api';
import { createServer } from 'node:net';

export const APP_PORT_MIN = 12000;
export const APP_PORT_MAX = 12999;

/** True when nothing listens on 127.0.0.1:<port>. */
export function loopbackPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** The lowest port from `from` up that no app holds and nothing else listens on. */
export async function allocatePort(
  taken: Iterable<number>,
  isFree: (port: number) => Promise<boolean> = loopbackPortFree,
  from: number = APP_PORT_MIN,
): Promise<number> {
  const held = new Set(taken);
  for (let port = Math.max(from, APP_PORT_MIN); port <= APP_PORT_MAX; port++) {
    if (!held.has(port) && (await isFree(port))) return port;
  }
  throw hlabsError('APP_PORT_IN_USE', 'No free port in 12000–12999');
}
