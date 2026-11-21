// `hlabsd --set-ports <https> <http>`: the Linux installer saves the ports it found free before the first start
// (US-INST-23, D-140, D-016), so the daemon and Caddy use the same ones from the start.
import { getSetting, openDb, setSetting } from '@hlabs/db';

const port = (value: string | undefined) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`"${value ?? ''}" is not a port`);
  return n;
};

/** Saves `settings.network.ports` in the database under `dataDir` (created and migrated when it's new). */
export function setPorts(
  dataDir: string,
  args: readonly string[],
  migrationsDir?: string,
): { https: number; http: number } {
  const ports = { https: port(args[0]), http: port(args[1]) };
  const db = openDb({ dataDir, migrationsDir });
  try {
    setSetting(db, 'network', { ...getSetting(db, 'network'), ports, returnTo: null });
  } finally {
    db.$client.close();
  }
  return ports;
}
