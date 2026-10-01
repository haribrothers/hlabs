// Restarting the container engine (US-SYS-18, US-SYS-19): each engine's own command. Behind an interface: tests and
// e2e (HLABS_DEV_NO_ENGINE_CONTROL) use one that never touches the real engine.
import { hlabsError } from '@hlabs/api';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { colimaEnv } from './colima-installer';
import { HLABS_COLIMA_PROFILE } from './detect';
import type { EngineCandidate } from './types';

export interface ColimaResources {
  cpus: number;
  memoryBytes: number;
  diskBytes: number;
}

export interface EngineControl {
  /** Restarts the engine; resolves when its restart command has finished (it may not answer yet). */
  restart(candidate: EngineCandidate, signal: AbortSignal): Promise<void>;
  /** Starts a stopped engine (US-STATE-09); resolves when its start command has finished (it may not answer yet). */
  start(candidate: EngineCandidate, signal: AbortSignal): Promise<void>;
  /** hlabs's Colima only: stop, then start with these resources (applied on start; disk can only grow). */
  restartColimaWith(resources: ColimaResources, signal: AbortSignal): Promise<void>;
}

const GIB = 2 ** 30;

function run(command: string, args: string[], opts: { env?: NodeJS.ProcessEnv; signal: AbortSignal }): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env: opts.env, signal: opts.signal, timeout: 5 * 60_000 }, (err, _stdout, stderr) => {
      if (err)
        reject(
          hlabsError('ENGINE_START_FAILED', `${command} ${args.join(' ')}: ${String(stderr || err.message).trim()}`),
        );
      else resolve();
    });
  });
}

/** The real commands: Colima, OrbStack, Docker Desktop, and Docker Engine on Linux through hlabs-priv (D-061). */
export function nodeEngineControl(opts: { engineDir: string; privHelper: string }): EngineControl {
  const colima = join(opts.engineDir, 'bin', 'colima');
  return {
    async restart(candidate, signal) {
      switch (candidate.kind) {
        case 'colima': {
          const profile = candidate.socketPath.split('/').at(-2) ?? HLABS_COLIMA_PROFILE;
          if (candidate.managedByHlabs) {
            return run(colima, ['restart', HLABS_COLIMA_PROFILE], { env: colimaEnv(opts.engineDir), signal });
          }
          return run('colima', ['restart', profile], { signal });
        }
        case 'orbstack':
          await run('orbctl', ['stop'], { signal });
          return run('orbctl', ['start'], { signal });
        case 'docker-desktop':
          return run('docker', ['desktop', 'restart'], { signal });
        case 'docker-engine':
          return run('sudo', ['-n', opts.privHelper, 'restart-docker'], { signal });
      }
    },
    async start(candidate, signal) {
      switch (candidate.kind) {
        case 'colima': {
          if (candidate.managedByHlabs) {
            return run(colima, ['start', HLABS_COLIMA_PROFILE], { env: colimaEnv(opts.engineDir), signal });
          }
          return run('colima', ['start', candidate.socketPath.split('/').at(-2) ?? HLABS_COLIMA_PROFILE], { signal });
        }
        case 'orbstack':
          return run('open', ['-a', 'OrbStack'], { signal });
        case 'docker-desktop':
          return run('open', ['-a', 'Docker'], { signal });
        case 'docker-engine':
          return run('sudo', ['-n', opts.privHelper, 'start-docker'], { signal });
      }
    },
    async restartColimaWith(resources, signal) {
      const env = colimaEnv(opts.engineDir);
      await run(colima, ['stop', HLABS_COLIMA_PROFILE], { env, signal });
      await run(
        colima,
        [
          'start',
          HLABS_COLIMA_PROFILE,
          '--cpu',
          String(resources.cpus),
          '--memory',
          String(Math.round(resources.memoryBytes / GIB)),
          '--disk',
          String(Math.round(resources.diskBytes / GIB)),
        ],
        { env, signal },
      );
    },
  };
}

/**
 * Development and e2e: pretend. The engine keeps running as it was; starting ends a simulated stop (/dev/engine).
 */
export function noEngineControl(opts: { onStart?: () => Promise<unknown> } = {}): EngineControl {
  return {
    async restart() {},
    async start() {
      await opts.onStart?.();
    },
    async restartColimaWith() {},
  };
}
