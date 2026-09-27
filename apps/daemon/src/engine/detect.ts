// Container engine detection order (docs/prd/02-architecture.md §2.4): OrbStack → Docker Desktop →
// Colima (hlabs profile first) → DOCKER_HOST → /var/run/docker.sock. First socket that answers wins.
import type { EngineKind } from '@hlabs/api';
import { join } from 'node:path';
import type { ContainerEngine, EngineCandidate, EngineStatus } from './types';

export const HLABS_COLIMA_PROFILE = 'hlabs';

export interface CandidateInput {
  home: string;
  env: { DOCKER_HOST?: string };
  /** Colima profile names found under ~/.colima. */
  colimaProfiles: string[];
  preferred: EngineKind | 'auto';
}

export function engineCandidates({ home, env, colimaProfiles, preferred }: CandidateInput): EngineCandidate[] {
  const colima = [...colimaProfiles]
    .filter((p) => !p.startsWith('_'))
    .sort((a, b) => Number(b === HLABS_COLIMA_PROFILE) - Number(a === HLABS_COLIMA_PROFILE) || a.localeCompare(b))
    .map<EngineCandidate>((profile) => ({
      kind: 'colima',
      socketPath: join(home, '.colima', profile, 'docker.sock'),
      managedByHlabs: profile === HLABS_COLIMA_PROFILE,
    }));

  const dockerHost = env.DOCKER_HOST?.startsWith('unix://') ? env.DOCKER_HOST.slice('unix://'.length) : null;

  const list: EngineCandidate[] = [
    { kind: 'orbstack', socketPath: join(home, '.orbstack', 'run', 'docker.sock'), managedByHlabs: false },
    { kind: 'docker-desktop', socketPath: join(home, '.docker', 'run', 'docker.sock'), managedByHlabs: false },
    ...colima,
    ...(dockerHost ? [{ kind: 'docker-engine' as const, socketPath: dockerHost, managedByHlabs: false }] : []),
    { kind: 'docker-engine', socketPath: '/var/run/docker.sock', managedByHlabs: false },
  ];

  const unique = list.filter((c, i) => list.findIndex((o) => o.socketPath === c.socketPath) === i);
  if (preferred === 'auto') return unique;
  return [...unique.filter((c) => c.kind === preferred), ...unique.filter((c) => c.kind !== preferred)];
}

export interface DetectDeps {
  exists(path: string): Promise<boolean>;
  connect(candidate: EngineCandidate): ContainerEngine;
}

/** Tries candidates in order. A socket that exists but doesn't answer means that engine is stopped. */
export async function detectEngine(
  candidates: EngineCandidate[],
  deps: DetectDeps,
): Promise<{ status: EngineStatus; engine: ContainerEngine | null }> {
  let stopped: EngineCandidate | null = null;
  for (const candidate of candidates) {
    if (!(await deps.exists(candidate.socketPath))) continue;
    const engine = deps.connect(candidate);
    if (await engine.ping()) {
      try {
        return { status: { state: 'running', candidate, info: await engine.info() }, engine };
      } catch {
        // Answers ping but not info: treat as stopped and keep looking.
      }
    }
    stopped ??= candidate;
  }
  return { status: stopped ? { state: 'stopped', candidate: stopped } : { state: 'missing' }, engine: null };
}
