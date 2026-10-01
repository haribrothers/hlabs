// The onboarding system check (US-ONB-04): CPU, OS, container engine, free disk and web ports.
import type { systemCheckSchema } from '@hlabs/api';
import type { z } from 'zod';
import type { EngineService } from '../engine/service';
import type { SystemProbe } from '../platform/system';

export type SystemCheck = z.infer<typeof systemCheckSchema>;

export const DISK_ERROR_BYTES = 10e9;
export const DISK_WARNING_BYTES = 30e9;
/** Fallbacks when 80 / 443 are taken (network.ports). */
export const FALLBACK_PORTS = { http: 8080, https: 8443 } as const;

export interface SystemCheckDeps {
  engine: EngineService;
  probe: SystemProbe;
  storageRoot: string;
  headless: boolean;
}

type EngineCheck = Pick<SystemCheck['engine'], 'kind' | 'version' | 'state' | 'level'>;

/**
 * The engine as the check reports it (US-ONB-04, US-ONB-07): a socket this account can't open is `noAccess`, and
 * on a Mac an installed but quit OrbStack or Docker Desktop (no socket) is `stopped`, not `missing`.
 */
async function engineState(
  status: Awaited<ReturnType<EngineService['check']>>,
  probe: SystemProbe,
  platform: 'darwin' | 'linux',
): Promise<EngineCheck> {
  if (status.state === 'running') {
    return { kind: status.candidate.kind, version: status.info.version, state: 'running', level: 'ok' };
  }
  if (status.state === 'stopped') {
    const state = (await probe.canAccess(status.candidate.socketPath)) ? 'stopped' : 'noAccess';
    return { kind: status.candidate.kind, version: null, state, level: 'error' };
  }
  const [app] = platform === 'darwin' ? await probe.installedEngineApps() : [];
  if (app) return { kind: app, version: null, state: 'stopped', level: 'error' };
  return { kind: null, version: null, state: 'missing', level: 'error' };
}

export async function runSystemCheck({
  engine,
  probe,
  storageRoot,
  headless,
}: SystemCheckDeps): Promise<Omit<SystemCheck, 'hostname'>> {
  const [status, os, freeBytes, httpInUse, httpsInUse] = await Promise.all([
    engine.check(),
    probe.os(),
    probe.freeBytes(storageRoot),
    probe.portInUse(80),
    probe.portInUse(443),
  ]);

  const disk = {
    freeBytes,
    path: storageRoot,
    level: freeBytes < DISK_ERROR_BYTES ? 'error' : freeBytes < DISK_WARNING_BYTES ? 'warning' : 'ok',
  } as const;
  const engineCheck = { ...(await engineState(status, probe, os.platform)), install: null };
  const ports = {
    http: { port: 80, inUse: httpInUse, use: httpInUse ? FALLBACK_PORTS.http : 80 },
    https: { port: 443, inUse: httpsInUse, use: httpsInUse ? FALLBACK_PORTS.https : 443 },
    level: httpInUse || httpsInUse ? 'warning' : 'ok',
  } as const;

  return {
    cpu: probe.cpu(),
    os: { ...os, headless },
    engine: engineCheck,
    disk,
    ports,
    canContinue: engineCheck.level !== 'error' && disk.level !== 'error',
  };
}
