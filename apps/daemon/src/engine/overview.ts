// What Settings › Engine & startup shows (US-SYS-17): the engine hlabs uses, its state, and the others on this
// computer. Built from facts the router gathers, so it's easy to test.
import type { EngineKind } from '@hlabs/api';
import { colimaResources } from './colima-installer';
import type { EngineStatus } from './types';

export interface EngineFacts {
  platform: 'darwin' | 'linux';
  status: EngineStatus;
  /** An engine install or restart job is running. */
  busy: boolean;
  /** Engine apps installed on this Mac, running or not. */
  installedApps: EngineKind[];
  /** hlabs's own Colima is installed (or any Colima profile exists). */
  colimaInstalled: boolean;
  /** This computer: cores, memory, and free space where the engine keeps its disk. */
  host: { cpus: number; memoryBytes: number; freeDiskBytes: number };
  /** hlabs's Colima as last applied, or null for the install defaults. */
  colimaResources: { cpus: number; memoryBytes: number; diskBytes?: number } | null;
}

const GIB = 2 ** 30;
/** hlabs's Colima install defaults: the installer's own numbers (US-ONB-05). */
export function colimaDefaults(host: { cpus: number; memoryBytes: number }) {
  const { cpus, memoryGib, diskGib } = colimaResources(host);
  return { cpus, memoryBytes: memoryGib * GIB, diskBytes: diskGib * GIB };
}

/**
 * What the resources may be set to (US-SYS-19): 1 to all cores; 2 GB to all memory but 2 GB; the disk from its
 * current size (it can only grow) up to that plus the free space.
 */
export function resourceLimits(host: EngineFacts['host'], currentDiskBytes: number) {
  return {
    maxCpus: host.cpus,
    minMemoryBytes: 2 * GIB,
    maxMemoryBytes: Math.max(2 * GIB, host.memoryBytes - 2 * GIB),
    minDiskBytes: currentDiskBytes,
    maxDiskBytes: currentDiskBytes + host.freeDiskBytes,
  };
}

/** Why these resources can't be applied, or null. */
export function resourcesProblem(
  r: { cpus: number; memoryBytes: number; diskBytes: number },
  limits: ReturnType<typeof resourceLimits>,
): 'cpus' | 'memory' | 'disk' | null {
  if (r.cpus < 1 || r.cpus > limits.maxCpus) return 'cpus';
  if (r.memoryBytes < limits.minMemoryBytes || r.memoryBytes > limits.maxMemoryBytes) return 'memory';
  if (r.diskBytes < limits.minDiskBytes || r.diskBytes > limits.maxDiskBytes) return 'disk';
  return null;
}

/** hlabs's Colima's current resources: as last applied, else the install defaults. */
export function currentColima(f: Pick<EngineFacts, 'host' | 'colimaResources'>) {
  const d = colimaDefaults(f.host);
  const r = f.colimaResources;
  return r ? { cpus: r.cpus, memoryBytes: r.memoryBytes, diskBytes: r.diskBytes ?? d.diskBytes } : d;
}

const MAC_ENGINES: EngineKind[] = ['orbstack', 'docker-desktop', 'colima'];

export function engineOverview(f: EngineFacts) {
  const candidate = f.status.state === 'missing' ? null : f.status.candidate;
  const status = f.busy ? 'starting' : f.status.state;
  const installed = (kind: EngineKind) =>
    kind === 'colima' ? f.colimaInstalled : kind === 'docker-engine' ? false : f.installedApps.includes(kind);
  // Linux: containers run on the host's Docker Engine; the Mac apps don't exist there.
  const kinds: EngineKind[] =
    f.platform === 'darwin'
      ? MAC_ENGINES
      : ['docker-engine', ...(candidate && candidate.kind !== 'docker-engine' ? [candidate.kind] : [])];
  return {
    platform: f.platform,
    status,
    active: candidate
      ? {
          kind: candidate.kind,
          managedByHlabs: candidate.managedByHlabs,
          version: f.status.state === 'running' ? f.status.info.version : null,
        }
      : null,
    resources: resourcesFor(f, candidate),
    engines: kinds.map((kind) => ({
      kind,
      availability:
        candidate?.kind === kind
          ? ('active' as const)
          : installed(kind) || (f.platform === 'linux' && kind === 'docker-engine')
            ? ('found' as const)
            : ('notInstalled' as const),
    })),
  } as const;
}

function resourcesFor(f: EngineFacts, candidate: { kind: EngineKind; managedByHlabs: boolean } | null) {
  // Linux: containers use the host directly.
  if (f.platform !== 'darwin' || !candidate) return null;
  if (candidate.kind === 'colima' && candidate.managedByHlabs) {
    const current = currentColima(f);
    return { editable: true, ...current, limits: resourceLimits(f.host, current.diskBytes) };
  }
  const info = f.status.state === 'running' ? f.status.info : null;
  return {
    editable: false,
    cpus: info?.cpus ?? null,
    memoryBytes: info?.memoryBytes ?? null,
    diskBytes: null,
    limits: resourceLimits(f.host, 0),
  };
}
