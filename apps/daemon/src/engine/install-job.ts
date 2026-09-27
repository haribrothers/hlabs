// The engine_install job (US-ONB-05): hlabs's own Colima, logged to <dataDir>/engine/install.log.
import { mkdir, readFile, rm, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobRunner } from '../jobs/runner';
import type { SystemProbe } from '../platform/system';
import { installColima, type InstallerHost } from './colima-installer';
import type { EngineService } from './service';

export const engineDir = (dataDir: string) => join(dataDir, 'engine');
export const installLogPath = (dataDir: string) => join(engineDir(dataDir), 'install.log');

export interface EngineInstallDeps {
  jobs: JobRunner;
  engine: EngineService;
  probe: SystemProbe;
  io: InstallerHost;
  dataDir: string;
  home: string;
  /** Records the download in "What hlabs connects to" (D-057). */
  onDownload(): void;
  pingTimeoutMs?: number;
}

export function registerEngineInstall(deps: EngineInstallDeps): void {
  deps.jobs.register('engine_install', {
    async run({ report, signal }) {
      const dir = engineDir(deps.dataDir);
      const logFile = installLogPath(deps.dataDir);
      await mkdir(dir, { recursive: true });
      await rm(logFile, { force: true });
      deps.onDownload();
      await installColima({
        engineDir: dir,
        home: deps.home,
        arch: deps.probe.cpu().arch === 'arm64' ? 'arm64' : 'x64',
        host: deps.probe.resources(),
        io: deps.io,
        signal,
        report,
        appendLog: (line) => appendFile(logFile, `${line}\n`),
        pingTimeoutMs: deps.pingTimeoutMs,
      });
      // Pick up the new engine now instead of on the next 10 s check.
      await deps.engine.check();
    },
  });
}

export async function readInstallLog(dataDir: string): Promise<string> {
  return readFile(installLogPath(dataDir), 'utf8').catch(() => '');
}
