// Facts about this computer for the onboarding system check (US-ONB-04). Behind an interface so tests use a fake.
import type { EngineKind } from '@hlabs/api';
import { constants } from 'node:fs';
import { access, readFile, stat, statfs } from 'node:fs/promises';
import { createServer } from 'node:net';
import { arch, cpus, homedir, release, totalmem } from 'node:os';
import { dirname, join } from 'node:path';

export interface OsInfo {
  platform: 'darwin' | 'linux';
  /** "macOS", "Ubuntu", "Debian GNU/Linux"… */
  name: string;
  /** "15", "24.04"… */
  version: string;
}

export interface SystemProbe {
  cpu(): { model: string; arch: string };
  /** CPU cores and memory, for sizing hlabs's Colima VM. */
  resources(): { cpus: number; memoryBytes: number };
  os(): Promise<OsInfo>;
  /** Free bytes on the volume holding `path` (or its nearest existing parent). */
  freeBytes(path: string): Promise<number>;
  /** Size and free space of the volume holding `path` (US-HOME-02). */
  diskSpace(path: string): Promise<{ totalBytes: number; freeBytes: number }>;
  /** Which volume holds `path` (or its nearest existing parent), to tell whether two paths share a disk; null if unknown. */
  diskId(path: string): Promise<string | null>;
  /** Where an engine keeps its images: a VM's disk lives in the home folder; Docker Engine uses /var/lib/docker. */
  engineStoragePath(kind: EngineKind): string;
  /** Another process is listening on the port (all interfaces). */
  portInUse(port: number): Promise<boolean>;
  /** This account may read and write the socket (false: e.g. not in the `docker` group). */
  canAccess(socketPath: string): Promise<boolean>;
  /** Engine apps installed on a Mac (OrbStack, Docker Desktop), in detection order, running or not. */
  installedEngineApps(): Promise<EngineKind[]>;
}

/** Where the Mac engine apps live (/Applications or ~/Applications). */
const ENGINE_APPS: Array<{ kind: EngineKind; app: string }> = [
  { kind: 'orbstack', app: 'OrbStack.app' },
  { kind: 'docker-desktop', app: 'Docker.app' },
];

/** macOS major version from the Darwin kernel release: Darwin 20–24 are macOS 11–15, Darwin 25 is macOS 26. */
export function macosVersion(kernelRelease: string): string {
  const darwin = Number.parseInt(kernelRelease, 10);
  if (!Number.isFinite(darwin)) return '';
  return String(darwin >= 25 ? darwin + 1 : darwin - 9);
}

/** NAME and VERSION_ID from /etc/os-release. */
export function parseOsRelease(text: string): { name: string; version: string } {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values.set(match[1]!, match[2]!.replace(/^["']|["']$/g, ''));
  }
  return { name: values.get('NAME') ?? 'Linux', version: values.get('VERSION_ID') ?? '' };
}

export class NodeSystemProbe implements SystemProbe {
  cpu() {
    return { model: cpus()[0]?.model.trim() ?? 'unknown', arch: arch() };
  }

  resources() {
    return { cpus: cpus().length, memoryBytes: totalmem() };
  }

  async os(): Promise<OsInfo> {
    if (process.platform === 'darwin') return { platform: 'darwin', name: 'macOS', version: macosVersion(release()) };
    const text = await readFile('/etc/os-release', 'utf8').catch(() => '');
    return { platform: 'linux', ...parseOsRelease(text) };
  }

  async freeBytes(path: string): Promise<number> {
    return (await this.diskSpace(path)).freeBytes;
  }

  async diskSpace(path: string) {
    for (let dir = path; ; dir = dirname(dir)) {
      try {
        const stats = await statfs(dir);
        return { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(dir) === dir) throw err;
      }
    }
  }

  async diskId(path: string): Promise<string | null> {
    for (let dir = path; ; dir = dirname(dir)) {
      try {
        return String((await stat(dir)).dev);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(dir) === dir) return null;
      }
    }
  }

  engineStoragePath(kind: EngineKind): string {
    return kind === 'docker-engine' ? '/var/lib/docker' : homedir();
  }

  canAccess(socketPath: string): Promise<boolean> {
    return access(socketPath, constants.R_OK | constants.W_OK).then(
      () => true,
      () => false,
    );
  }

  async installedEngineApps(): Promise<EngineKind[]> {
    if (process.platform !== 'darwin') return [];
    const found: EngineKind[] = [];
    for (const { kind, app } of ENGINE_APPS) {
      for (const dir of ['/Applications', join(homedir(), 'Applications')]) {
        if (await this.canRead(join(dir, app))) {
          found.push(kind);
          break;
        }
      }
    }
    return found;
  }

  private canRead(path: string) {
    return access(path).then(
      () => true,
      () => false,
    );
  }

  /**
   * Tries to listen on the port. EADDRINUSE means another process has it; EACCES (a low port for a non-root
   * user on Linux) doesn't, because Caddy gets its own permission to bind it.
   */
  portInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.once('error', (err: NodeJS.ErrnoException) => resolve(err.code === 'EADDRINUSE'));
      server.listen({ port, host: '0.0.0.0', exclusive: true }, () => server.close(() => resolve(false)));
    });
  }
}
