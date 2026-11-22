// What an update asks for that the installed version didn't have (US-STORE-16): new folders (or a folder it may now
// write to), new ports, and wider permissions. Such an update never installs by itself; the Updates list says it
// "asks for new access" and its Review sheet lists only these.
import type { AppManifest } from './manifest';

type Access = Pick<AppManifest, 'folders' | 'ports' | 'permissions'>;

export interface NewAccess {
  folders: Array<{ key: string; label: string; mode: 'ro' | 'rw' }>;
  ports: Array<{ label: string; host: number; protocol: 'tcp' | 'udp' }>;
  /** Only what grew: `network` is the new level when it reaches further (none < lan < internet). */
  permissions: { network: 'lan' | 'internet' | null; gpu: boolean; dockerSocket: boolean };
}

const REACH = { none: 0, lan: 1, internet: 2 } as const;

/** The access `next` asks for beyond `current`, or null when it asks for nothing new. */
export function newAccess(current: Access, next: Access): NewAccess | null {
  const folders = next.folders.flatMap((f) => {
    const had = current.folders.find((c) => c.key === f.key);
    return !had || (had.mode === 'ro' && f.mode === 'rw') ? [{ key: f.key, label: f.label, mode: f.mode }] : [];
  });
  const ports = next.ports.flatMap((p) =>
    current.ports.some((c) => c.host === p.host && c.protocol === p.protocol)
      ? []
      : [{ label: p.label, host: p.host, protocol: p.protocol }],
  );
  const network =
    REACH[next.permissions.network] > REACH[current.permissions.network]
      ? (next.permissions.network as 'lan' | 'internet')
      : null;
  const permissions = {
    network,
    gpu: next.permissions.gpu && !current.permissions.gpu,
    dockerSocket: next.permissions.dockerSocket && !current.permissions.dockerSocket,
  };
  const any = folders.length || ports.length || network || permissions.gpu || permissions.dockerSocket;
  return any ? { folders, ports, permissions } : null;
}

/** The store has something newer than what's installed: another version, or the same version with a higher revision. */
export function isNewer(
  installed: { version: string; revision?: number },
  store: { version: string; revision?: number },
): boolean {
  return store.version !== installed.version || (store.revision ?? 0) > (installed.revision ?? 0);
}
