// Runs the bundled Caddy and loads config through its admin API (D-006). The admin API listens on an owner-only
// unix socket in the data directory, not on localhost:2019, so other local users and a Caddy the person runs
// themselves can't collide with it or change it (D-073). If Caddy exits, it is started again after a pause.
import type { ChildRegistry } from '../platform/children';
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
  /**
   * Runs around starting a new Caddy, given the web ports it will listen on: remote access frees Tailscale Serve's
   * hold on them first (on macOS Serve listens on the ports it serves), then serves again once Caddy has them.
   */
  aroundStart?: (ports: number[], start: () => Promise<void>) => Promise<void>;
  /** How long to wait before trying apps' own ports again after one was taken (default 30 s). */
  blockedRetryMs?: number;
  /** Records the running Caddy, so a killed daemon's is ended at the next start. */
  children?: ChildRegistry;
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
  /** The app ports that couldn't be served last time (`12000,12003`), or null. */
  private blockedPorts: string | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  /** The web port another program held the last time Caddy tried to start (US-SYS-42). */
  private heldPort: number | null = null;
  /** The ports last warned about, so a retry that fails the same way stays quiet. */
  private warnedPorts: string | null = null;
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    await adminRequest(this.paths.adminSocket, 'POST', '/stop').catch(() => child.kill('SIGTERM'));
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => (child.kill('SIGKILL'), resolve()), 5_000);
      child.once('exit', () => (clearTimeout(timer), resolve()));
    });
  }

  /**
   * Loads the config. When it can't be (another program holds one of the apps' own ports, or the Caddy a restarted
   * daemon left behind hasn't let go of it yet), the apps are served on their hostnames only, and their ports are
   * tried again when they change and every 30 s.
   */
  private async applyNow(state: ProxyState): Promise<void> {
    const starting = !this.child || this.child.exitCode !== null;
    if (starting && this.deps.aroundStart)
      return this.deps.aroundStart([state.ports.https, state.ports.http], () => this.applyState(state));
    return this.applyState(state);
  }

  private async applyState(state: ProxyState): Promise<void> {
    const ports = state.apps.map((a) => a.port).join(',');
    if (this.blockedPorts !== ports) {
      try {
        await this.load(buildCaddyConfig(state, this.paths));
        this.warnedPorts = null;
        return;
      } catch (err) {
        if (!state.apps.length) throw err;
        this.blockedPorts = ports;
        if (this.warnedPorts !== ports)
          this.deps.logger.warn({ err, ports }, "couldn't serve apps on their own ports; serving their hostnames only");
        this.warnedPorts = ports;
        this.retryBlockedLater();
      }
    }
    await this.load(buildCaddyConfig(state, this.paths, { appPorts: false }));
  }

  problem() {
    return this.heldPort === null ? null : { port: this.heldPort };
  }

  private async load(config: unknown): Promise<void> {
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
    this.deps.children?.add(child.pid, configFile);
    let stderr = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-4_000)));
    let running = false;
    child.once('exit', (code, signal) => {
      this.deps.children?.remove(child.pid);
      // A Caddy that never came up is the caller's to retry (D-111); one that stops later is started again here.
      if (this.stopping || !running) return;
      this.deps.logger.error({ code, signal, stderr: stderr.slice(-1_000) }, 'caddy exited; starting it again');
      const timer = setTimeout(() => {
        if (!this.stopping && this.last) void this.apply(this.last).catch((err: unknown) => this.logFailure(err));
      }, this.deps.restartDelayMs ?? 2_000);
      timer.unref();
    });

    const deadline = Date.now() + 15_000;
    for (;;) {
      if (child.exitCode !== null) {
        this.heldPort = portInUse(stderr);
        throw new Error(`caddy exited at start: ${stderr.slice(-1_000)}`);
      }
      try {
        await adminRequest(this.paths.adminSocket, 'GET', '/config/');
        chmodSync(this.paths.adminSocket, 0o600);
        running = true;
        this.heldPort = null;
        this.deps.logger.info({ pid: child.pid }, 'caddy is running');
        return;
      } catch {
        if (Date.now() > deadline) throw new Error(`caddy didn't answer on its admin socket: ${stderr.slice(-1_000)}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  private retryBlockedLater() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.stopping || !this.last) return;
      this.blockedPorts = null;
      void this.apply(this.last).catch((err: unknown) => this.logFailure(err));
    }, this.deps.blockedRetryMs ?? 30_000);
    this.retryTimer.unref();
  }

  private logFailure(err: unknown) {
    this.deps.logger.error({ err }, 'caddy could not be started');
  }
}

/** The port Caddy couldn't listen on because it's in use (`listen tcp :443: bind: address already in use`), or null. */
export function portInUse(stderr: string): number | null {
  const match = /listen tcp [^\s]*?:(\d+): bind: address already in use/.exec(stderr);
  return match ? Number(match[1]) : null;
}
