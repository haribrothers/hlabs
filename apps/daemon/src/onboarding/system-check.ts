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

export async function runSystemCheck({ engine, probe, storageRoot, headless }: SystemCheckDeps): Promise<SystemCheck> {
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
  const engineCheck = {
    kind: status.state === 'missing' ? null : status.candidate.kind,
    version: status.state === 'running' ? status.info.version : null,
    state: status.state,
    level: status.state === 'running' ? 'ok' : 'error',
  } as const;
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
