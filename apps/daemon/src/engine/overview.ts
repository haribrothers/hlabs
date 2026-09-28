// What Settings › Engine & startup shows (US-SYS-17): the engine hlabs uses, its state, and the others on this
// computer. Built from facts the router gathers, so it's easy to test.
import type { EngineKind } from '@hlabs/api';
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
