// Runs the bundled Caddy and loads config through its admin API (D-006). The admin API listens on an owner-only
// unix socket in the data directory, not on localhost:2019, so other local users and a Caddy the person runs
// themselves can't collide with it or change it (D-073). If Caddy exits, it is started again after a pause.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import type { Logger } from '../logger';
import { buildCaddyConfig, type CaddyPaths } from './config';
import type { ProxyManager, ProxyState } from './index';

export interface CaddyProxyDeps {
  /** `<binDir>/caddy` */
  binary: string;
  /** `<dataDir>/caddy` */
  dir: string;
  webFallbackDir: string;
  logger: Logger;
  restartDelayMs?: number;
}

/** Unix socket paths are limited to about 104 bytes (macOS). A deep data directory gets a short socket in an
 * owner-only folder under /tmp instead. */
export function adminSocketPath(dir: string): string {
  const inDir = join(dir, 'admin.sock');
  if (Buffer.byteLength(inDir) <= 100) return inDir;
  const short = join('/tmp', `hlabs-${process.getuid?.() ?? 'user'}`);
  mkdirSync(short, { recursive: true, mode: 0o700 });
  chmodSync(short, 0o700);
  return join(short, `caddy-${createHash('sha256').update(dir).digest('hex').slice(0, 12)}.sock`);
}

/** A request to the admin API over its unix socket. */
export function adminRequest(socketPath: string, method: string, path: string, body?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        socketPath,
        method,
        path,
        // Caddy checks the Host of admin requests; over a socket it expects none in particular.
        headers: { Host: '', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        timeout: 30_000,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () =>
          res.statusCode && res.statusCode < 300
            ? resolve(text)
            : reject(new Error(`caddy admin ${method} ${path}: ${res.statusCode} ${text.slice(0, 500)}`)),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('caddy admin timed out')));
    req.end(payload);
  });
}

export class CaddyProxy implements ProxyManager {
  private child: ChildProcess | null = null;
  private stopping = false;
  private last: ProxyState | null = null;
  private queue: Promise<void> = Promise.resolve();
  readonly paths: CaddyPaths;

  constructor(private readonly deps: CaddyProxyDeps) {
    this.paths = {
      storageDir: join(deps.dir, 'data'),
      adminSocket: adminSocketPath(deps.dir),
      logFile: join(deps.dir, 'caddy.log'),
      webFallbackDir: deps.webFallbackDir,
    };
  }

  /** Applies one state at a time, in order. */
  apply(state: ProxyState): Promise<void> {
    this.last = state;
    const next = this.queue.then(() => this.applyNow(state));
    this.queue = next.catch(() => undefined);
    return next;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    await adminRequest(this.paths.adminSocket, 'POST', '/stop').catch(() => child.kill('SIGTERM'));
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => (child.kill('SIGKILL'), resolve()), 5_000);
      child.once('exit', () => (clearTimeout(timer), resolve()));
    });
  }

  private async applyNow(state: ProxyState): Promise<void> {
    const config = buildCaddyConfig(state, this.paths);
    if (!this.child || this.child.exitCode !== null) {
      await this.spawn(config);
      return;
    }
    await adminRequest(this.paths.adminSocket, 'POST', '/load', config);
  }

  /** Starts Caddy with the config in a file (owner-only) and waits for the admin socket to answer. */
  private async spawn(config: unknown): Promise<void> {
    if (!existsSync(this.deps.binary)) {
      throw new Error(`Caddy isn't at ${this.deps.binary}; run pnpm fetch-binaries`);
    }
    mkdirSync(this.paths.storageDir, { recursive: true, mode: 0o700 });
    chmodSync(this.deps.dir, 0o700);
    rmSync(this.paths.adminSocket, { force: true });
    const configFile = join(this.deps.dir, 'caddy.json');
    writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });

    const child = spawn(this.deps.binary, ['run', '--config', configFile], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        HOME: dirname(this.deps.dir),
        XDG_DATA_HOME: this.deps.dir,
        XDG_CONFIG_HOME: this.deps.dir,
      },
    });
    this.child = child;
    let stderr = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-4_000)));
    child.once('exit', (code, signal) => {
      if (this.stopping) return;
      this.deps.logger.error({ code, signal, stderr: stderr.slice(-1_000) }, 'caddy exited; starting it again');
      const timer = setTimeout(() => {
        if (!this.stopping && this.last) void this.apply(this.last).catch((err: unknown) => this.logFailure(err));
      }, this.deps.restartDelayMs ?? 2_000);
      timer.unref();
    });

    const deadline = Date.now() + 15_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`caddy exited at start: ${stderr.slice(-1_000)}`);
      try {
        await adminRequest(this.paths.adminSocket, 'GET', '/config/');
        chmodSync(this.paths.adminSocket, 0o600);
        this.deps.logger.info({ pid: child.pid }, 'caddy is running');
        return;
      } catch {
        if (Date.now() > deadline) throw new Error(`caddy didn't answer on its admin socket: ${stderr.slice(-1_000)}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  private logFailure(err: unknown) {
    this.deps.logger.error({ err }, 'caddy could not be started');
  }
}
