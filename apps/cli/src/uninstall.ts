// `hlabs uninstall` (D-144): root only; runs the installer this version came with (`install.sh --uninstall`), which
// asks what to keep and removes hlabs. The installer calls back with two options of its own: `--daemon-info` prints
// what the questions need, and `--daemon-job` runs the daemon's part (the hlabs_uninstall job, D-143) and waits for it.
import type { Job } from '@hlabs/api';
import type { Io } from './io';
import { CliError, DaemonError, NO_ACCESS, type DaemonClient } from './daemon';

export interface UninstallDeps {
  client: () => DaemonClient;
  isRoot: () => boolean;
  sleep: (ms: number) => Promise<void>;
  /** Runs `install.sh --uninstall <args>` with this terminal; returns its exit code. */
  runInstaller: (args: string[]) => number;
}

export const JOB_POLL_MS = 1_000;

export interface UninstallOptions {
  keepData: boolean;
  deleteEverything: boolean;
  yes: boolean;
  daemonInfo: boolean;
  daemonJob: boolean;
}

export async function uninstall(io: Io, deps: UninstallDeps, o: UninstallOptions): Promise<number> {
  if (!deps.isRoot()) throw new CliError('Run with sudo to uninstall hlabs', NO_ACCESS);
  if (o.keepData && o.deleteEverything) throw new CliError('Choose --keep-data or --delete-everything, not both');

  if (o.daemonInfo) {
    const info = await deps
      .client()
      .query<{ appCount: number; dataBytes: number | null; storageRoot: string }>('tray.uninstallInfo');
    io.out(`apps=${info.appCount}`);
    if (info.dataBytes !== null) io.out(`bytes=${info.dataBytes}`);
    io.out(`storage=${info.storageRoot}`);
    return 0;
  }

  if (o.daemonJob) {
    const client = deps.client();
    let jobId: string;
    try {
      ({ jobId } = await client.mutate<{ jobId: string }>('tray.uninstall', {
        keepData: !o.deleteEverything,
        removeColima: false,
        via: 'cli',
      }));
    } catch (err) {
      if (err instanceof DaemonError && err.hlabsCode === 'JOB_EXCLUSIVE_RUNNING') {
        throw new CliError(
          'hlabs is busy with another task, like a backup or an update. Try again when it has finished.',
        );
      }
      throw err;
    }
    for (;;) {
      const job = await client.query<Job>('tray.job', { jobId });
      if (job.state === 'succeeded') return 0;
      if (job.state === 'failed' || job.state === 'cancelled') {
        throw new CliError("Some apps couldn't be stopped. See: hlabs logs");
      }
      await deps.sleep(JOB_POLL_MS);
    }
  }

  return deps.runInstaller([
    ...(o.keepData ? ['--keep-data'] : []),
    ...(o.deleteEverything ? ['--delete-everything'] : []),
    ...(o.yes ? ['--yes'] : []),
  ]);
}
