// App stacks go up and down through the bundled compose CLI (D-003); everything else uses dockerode. Each app is
// the compose project `hlabs-<appId>` in `<dataDir>/apps/<appId>/` (02 §2.5).
import { hlabsError } from '@hlabs/api';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const COMPOSE_FILE = 'docker-compose.yml';
export const ENV_FILE = '.env';

export interface ComposeProject {
  /** `hlabs-<appId>` */
  name: string;
  /** Holds docker-compose.yml and .env. */
  dir: string;
}

export interface ComposeRunner {
  /** Creates or updates the containers and starts them. Images must already be pulled. */
  up(project: ComposeProject): Promise<void>;
  stop(project: ComposeProject): Promise<void>;
  restart(project: ComposeProject): Promise<void>;
  /** Removes the containers; the app's data folders stay. */
  down(project: ComposeProject): Promise<void>;
}

/** A compose command failed. `portInUse` is set when a published port was taken. */
export class ComposeError extends Error {
  override readonly name = 'ComposeError';
  constructor(
    message: string,
    readonly output: string,
    readonly portInUse: number | null,
  ) {
    super(message);
  }
}

export type Exec = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

const execCommand: Exec = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { ...options, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });

const PORT_TAKEN = [
  /Bind for [\d.:[\]]+?:(\d+) failed: port is already allocated/,
  /listen (?:tcp|udp)[46]? [\d.:[\]]*?:(\d+): bind: address already in use/,
  /ports are not available: exposing port (?:TCP|UDP) [\d.:[\]]*?:(\d+)/i,
];

/** The port a failed `up` couldn't publish, if that's why it failed. */
export function portInUseFrom(output: string): number | null {
  for (const pattern of PORT_TAKEN) {
    const match = pattern.exec(output);
    if (match) return Number(match[1]);
  }
  return null;
}

export interface CliComposeDeps {
  /** `<binDir>/docker-compose` when present (bundled, `pnpm fetch-binaries`); otherwise the `docker compose` plugin. */
  binDir: string;
  /** The running engine's socket, or null in engine-stopped mode. */
  socketPath: () => string | null;
  exec?: Exec;
  timeoutMs?: number;
}

export class CliComposeRunner implements ComposeRunner {
  constructor(private readonly deps: CliComposeDeps) {}

  up(project: ComposeProject) {
    return this.run(project, ['up', '--detach', '--pull', 'never', '--remove-orphans']);
  }

  stop(project: ComposeProject) {
    return this.run(project, ['stop']);
  }

  restart(project: ComposeProject) {
    return this.run(project, ['restart']);
  }

  down(project: ComposeProject) {
    return this.run(project, ['down', '--remove-orphans']);
  }

  /** The command and leading arguments for compose. */
  command(): { file: string; args: string[] } {
    const bundled = join(this.deps.binDir, 'docker-compose');
    return existsSync(bundled) ? { file: bundled, args: [] } : { file: 'docker', args: ['compose'] };
  }

  private async run(project: ComposeProject, args: string[]): Promise<void> {
    const socket = this.deps.socketPath();
    if (!socket) throw hlabsError('ENGINE_UNAVAILABLE');
    const { file, args: lead } = this.command();
    const full = [
      ...lead,
      '--project-name',
      project.name,
      '--project-directory',
      project.dir,
      '--file',
      join(project.dir, COMPOSE_FILE),
      '--env-file',
      join(project.dir, ENV_FILE),
      ...args,
    ];
    try {
      await (this.deps.exec ?? execCommand)(file, full, {
        env: { ...process.env, DOCKER_HOST: `unix://${socket}` },
        timeout: this.deps.timeoutMs ?? 10 * 60_000,
      });
    } catch (error) {
      const e = error as { stderr?: string; stdout?: string; message: string };
      const output = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message;
      throw new ComposeError(`compose ${args[0]} failed for ${project.name}`, output, portInUseFrom(output));
    }
  }
}
