// Waiting for an app to be healthy after `compose up` (02 §2.5): the manifest's `health` check, or by default the web
// service answering on its loopback port, within the manifest's timeout (default 120 s). Only the web service is
// published on the host (D-049), so an http or tcp check on another service falls back to its container state (D-075).
import type { AppManifest } from '@hlabs/app-manifest';
import { connect } from 'node:net';
import type { ContainerEngine, ContainerState } from '../engine/types';

export const DEFAULT_HEALTH_TIMEOUT_S = 120;

export type HealthResult =
  | { ok: true }
  | { ok: false; reason: 'timeout'; seconds: number }
  /** A container stopped with an error (not a one-shot service finishing). */
  | { ok: false; reason: 'exited'; service: string; exitCode: number | null };

export interface HealthProbes {
  /** HTTP status of a GET, or null when nothing answers. */
  http(url: string): Promise<number | null>;
  tcp(port: number): Promise<boolean>;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  now(): number;
}

export const realProbes: HealthProbes = {
  async http(url) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
      await res.body?.cancel();
      return res.status;
    } catch {
      return null;
    }
  },
  tcp(port) {
    return new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port, timeout: 2_000 });
      const done = (ok: boolean) => {
        socket.destroy();
        resolve(ok);
      };
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));
    });
  },
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    }),
  now: () => Date.now(),
};

export interface WaitHealthyInput {
  engine: ContainerEngine;
  project: string;
  manifest: AppManifest;
  webPort: number;
  signal?: AbortSignal;
  probes?: HealthProbes;
  intervalMs?: number;
}

export function healthTimeoutSeconds(manifest: AppManifest): number {
  return manifest.health?.timeout ?? DEFAULT_HEALTH_TIMEOUT_S;
}

const containerReady = (c: ContainerState | undefined) =>
  !!c && c.state === 'running' && (c.health === null || c.health === 'healthy');

/** One look: is the app healthy now? */
export async function checkHealthOnce(
  input: WaitHealthyInput,
): Promise<{ ready: boolean; failed?: Extract<HealthResult, { reason: 'exited' }> }> {
  const { manifest, webPort } = input;
  const probes = input.probes ?? realProbes;
  const containers = await input.engine.projectContainers(input.project);
  if (containers.length === 0) return { ready: false };

  const crashed = containers.find((c) => c.state === 'dead' || (c.state === 'exited' && c.exitCode !== 0));
  if (crashed)
    return {
      ready: false,
      failed: { ok: false, reason: 'exited', service: crashed.service, exitCode: crashed.exitCode },
    };

  const byService = (service: string) => containers.find((c) => c.service === service);
  const local = (path: string) => `http://127.0.0.1:${webPort}${path}`;
  const health = manifest.health;

  if (!health) {
    if (!containerReady(byService(manifest.web.service))) return { ready: false };
    const status = await probes.http(local(manifest.web.path));
    return { ready: status !== null && status < 500 };
  }
  const target = byService(health.service);
  if (!containerReady(target)) return { ready: false };
  const published = health.service === manifest.web.service;
  if (health.http !== undefined && published) {
    const status = await probes.http(local(health.http));
    return { ready: status !== null && status >= 200 && status < 400 };
  }
  if (health.tcp !== undefined && published && health.tcp === manifest.web.port) {
    return { ready: await probes.tcp(webPort) };
  }
  // `container: true`, or a check on a service that isn't published: its container state (and healthcheck) decides.
  return { ready: true };
}

export async function waitHealthy(input: WaitHealthyInput): Promise<HealthResult> {
  const probes = input.probes ?? realProbes;
  const seconds = healthTimeoutSeconds(input.manifest);
  const deadline = probes.now() + seconds * 1000;
  for (;;) {
    const { ready, failed } = await checkHealthOnce(input);
    if (ready) return { ok: true };
    if (failed) return failed;
    if (input.signal?.aborted || probes.now() >= deadline) return { ok: false, reason: 'timeout', seconds };
    await probes.sleep(input.intervalMs ?? 1_000, input.signal);
  }
}
