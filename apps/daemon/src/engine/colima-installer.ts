// Installs hlabs's own Colima on a Mac with no container engine (US-ONB-05, 02 §2.4, D-057): downloads the
// pinned Colima, Lima and docker CLI into <dataDir>/engine, checks their SHA-256, creates the `hlabs` profile
// (VZ + virtiofs) and starts it. Done only when the engine answers docker.ping().
import { hlabsError } from '@hlabs/api';
import { join } from 'node:path';
import { HLABS_COLIMA_PROFILE } from './detect';
import { ENGINE_DOWNLOADS, type MacArch } from './downloads';

/** The outside world the installer touches; real in production, fake in tests. */
export interface InstallerHost {
  /** Downloads `url` to `dest`, reporting bytes as they arrive. Throws ENGINE_DOWNLOAD_TIMEOUT when it stalls. */
  download(
    url: string,
    dest: string,
    onBytes: (received: number, total: number | null) => void,
    signal: AbortSignal,
  ): Promise<void>;
  sha256(file: string): Promise<string>;
  /** Unpacks a .tar.gz into `dir`. */
  extract(archive: string, dir: string, signal: AbortSignal): Promise<void>;
  /** Places a downloaded binary at `dest`, executable. */
  installBinary(file: string, dest: string): Promise<void>;
  /** Runs a command, streaming its output lines; throws if it exits non-zero. */
  run(
    command: string,
    args: string[],
    opts: { env: NodeJS.ProcessEnv; signal: AbortSignal; onLine: (line: string) => void },
  ): Promise<void>;
  ping(socketPath: string): Promise<boolean>;
  mkdir(dir: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Names in a folder ([] when it doesn't exist). */
  list(dir: string): Promise<string[]>;
  /** Removes a file or folder, recursively. */
  remove(path: string): Promise<void>;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export interface ColimaInstall {
  engineDir: string;
  home: string;
  arch: MacArch;
  host: { cpus: number; memoryBytes: number };
  io: InstallerHost;
  signal: AbortSignal;
  report(progress: number, lastLogLine?: string): void;
  /** Appends a line to the install log. */
  appendLog(line: string): Promise<void>;
  /** How long to wait for docker.ping() after `colima start` (default 120 s). */
  pingTimeoutMs?: number;
}

const GIB = 2 ** 30;

/** 4 CPUs and 8 GB, capped to the computer: never more CPUs than it has, and half its memory if it has under 16 GB. */
export function colimaResources(host: { cpus: number; memoryBytes: number }) {
  const hostGib = host.memoryBytes / GIB;
  return {
    cpus: Math.max(1, Math.min(4, host.cpus)),
    memoryGib: hostGib >= 16 ? 8 : Math.max(2, Math.floor(hostGib / 2)),
    diskGib: 100,
  };
}

export const colimaSocket = (home: string) => join(home, '.colima', HLABS_COLIMA_PROFILE, 'docker.sock');

/**
 * The environment for running hlabs's colima: its own bin first (colima needs limactl and docker), and its own
 * DOCKER_CONFIG so colima's docker context is kept inside <dataDir>/engine and the user's `docker` CLI context
 * (~/.docker) is never switched.
 */
export function colimaEnv(engineDir: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    PATH: `${join(engineDir, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,
    DOCKER_CONFIG: join(engineDir, 'docker-config'),
  };
}

/**
 * Installs and starts hlabs's Colima. On failure the last log line says what was happening and why
 * ("colima start: …", "lima download: …"), which the system check shows (US-ONB-06).
 */
export async function installColima(ctx: ColimaInstall): Promise<void> {
  let stage = 'setup';
  let progress = 0;
  const report = (p: number, line?: string) => {
    progress = p;
    ctx.report(p, line);
  };
  try {
    await runInstall({ ...ctx, report }, (s) => (stage = s));
  } catch (err) {
    if (!ctx.signal.aborted) {
      const line = `${stage}: ${err instanceof Error ? err.message : String(err)}`;
      await ctx.appendLog(line).catch(() => {});
      ctx.report(progress, line);
    }
    throw err;
  }
}

/**
 * After a failed install: deletes the `hlabs` Colima profile if it was created and everything under
 * <dataDir>/engine except the install log, so nothing on the computer has changed (US-ONB-06).
 */
export async function removeColimaInstall(ctx: Pick<ColimaInstall, 'engineDir' | 'home' | 'io' | 'appendLog'>) {
  const { io, engineDir, home } = ctx;
  const colima = join(engineDir, 'bin', 'colima');
  const profileDirs = [
    join(home, '.colima', HLABS_COLIMA_PROFILE),
    join(home, '.colima', '_lima', `colima-${HLABS_COLIMA_PROFILE}`),
  ];
  const profileExists = (await Promise.all(profileDirs.map((d) => io.exists(d)))).some(Boolean);
  if (profileExists && (await io.exists(colima))) {
    await ctx.appendLog('Removing the hlabs Colima profile');
    await io
      .run(colima, ['delete', '--profile', HLABS_COLIMA_PROFILE, '--force'], {
        env: colimaEnv(engineDir),
        signal: new AbortController().signal,
        onLine: (line) => void ctx.appendLog(line),
      })
      .catch((err: unknown) => ctx.appendLog(`colima delete: ${err instanceof Error ? err.message : String(err)}`));
  }
  for (const name of await io.list(engineDir)) {
    if (name !== INSTALL_LOG) await io.remove(join(engineDir, name));
  }
  await ctx.appendLog('Removed the partly installed files');
}

export const INSTALL_LOG = 'install.log';

// Progress: downloads 0–45, unpacking 45–50, `colima start` 50–95 (a step per output line), ping 95–100.
async function runInstall(ctx: ColimaInstall, setStage: (stage: string) => void): Promise<void> {
  const { io, signal, engineDir } = ctx;
  const bin = join(engineDir, 'bin');
  const downloads = join(engineDir, 'downloads');
  await io.mkdir(bin);
  await io.mkdir(downloads);

  const log = async (line: string, progress: number) => {
    await ctx.appendLog(line);
    ctx.report(progress, line);
  };

  const artifacts = ENGINE_DOWNLOADS[ctx.arch];
  const share = 45 / artifacts.length;
  for (const [i, artifact] of artifacts.entries()) {
    const file = join(
      downloads,
      `${artifact.name}-${artifact.version}${artifact.format === 'tar.gz' ? '.tar.gz' : ''}`,
    );
    setStage(`${artifact.name} download`);
    await log(`Downloading ${artifact.name} ${artifact.version}`, i * share);
    await io.download(
      artifact.url,
      file,
      (received, total) => {
        if (total) ctx.report(i * share + (received / total) * share);
      },
      signal,
    );
    const actual = await io.sha256(file);
    if (actual !== artifact.sha256) {
      await ctx.appendLog(`${artifact.name}: checksum mismatch (expected ${artifact.sha256}, got ${actual})`);
      throw hlabsError('ENGINE_START_FAILED', `${artifact.name} download did not match its checksum`);
    }
    if (artifact.format === 'binary') await io.installBinary(file, join(bin, artifact.name));
    else if (artifact.name === 'docker') {
      await io.extract(file, downloads, signal);
      await io.installBinary(join(downloads, 'docker', 'docker'), join(bin, 'docker'));
    } else await io.extract(file, engineDir, signal);
  }

  const { cpus, memoryGib, diskGib } = colimaResources(ctx.host);
  const args = [
    'start',
    '--profile',
    HLABS_COLIMA_PROFILE,
    '--cpu',
    String(cpus),
    '--memory',
    String(memoryGib),
    '--disk',
    String(diskGib),
    '--vm-type',
    'vz',
    '--mount-type',
    'virtiofs',
    '--runtime',
    'docker',
  ];
  let progress = 50;
  setStage('colima start');
  await log(`colima ${args.join(' ')}`, progress);
  // Output lines are logged in order, and all of them before the install moves on.
  let logged = Promise.resolve();
  try {
    await io.run(join(bin, 'colima'), args, {
      env: colimaEnv(engineDir),
      signal,
      onLine: (line) => {
        progress = Math.min(95, progress + 2);
        const at = progress;
        logged = logged.then(() => log(line, at));
      },
    });
  } catch (err) {
    await logged.catch(() => {});
    if (signal.aborted) throw err;
    throw hlabsError('ENGINE_START_FAILED', err instanceof Error ? err.message : String(err));
  }
  await logged;

  const socket = colimaSocket(ctx.home);
  const deadline = Date.now() + (ctx.pingTimeoutMs ?? 120_000);
  while (!(await io.ping(socket))) {
    if (Date.now() > deadline) {
      await log('Colima started but the engine did not answer', 95);
      throw hlabsError('ENGINE_START_FAILED', 'engine did not answer docker ping');
    }
    await io.sleep(2_000, signal);
  }
  await log('Colima is running', 100);
}
