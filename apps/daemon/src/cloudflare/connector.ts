// The bundled cloudflared, run by the daemon like Caddy (D-178): one connector for the tunnel, with one ingress rule
// that sends every public name to Caddy's public listener on 127.0.0.1 over TLS, trusting only hlabs's local CA (D-181) (which answers only public addresses and 404s
// the rest). Its config and the tunnel's credentials are files in the data dir (0600), never on the command line. It's
// recorded in the ChildRegistry, so a killed daemon's connector is ended at the next start, and started again after a
// pause if it stops.
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '../logger';
import type { ChildRegistry } from '../platform/children';
import type { ConnectorOrigin, ConnectorState, TunnelConnector } from './types';

export interface CloudflaredConnectorDeps {
  /** `<binDir>/cloudflared` */
  binary: string;
  /** `<dataDir>/cloudflare` */
  dir: string;
  logger: Logger;
  children?: ChildRegistry;
  restartDelayMs?: number;
  spawn?: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => ChildProcess;
}

/** cloudflared's config: the tunnel, its credentials file and the one ingress rule, to Caddy over TLS (D-181). */
export function connectorConfig(opts: ConnectorOrigin): string {
  return [
    `tunnel: ${opts.tunnelId}`,
    `credentials-file: ${JSON.stringify(opts.credentialsFile)}`,
    'no-autoupdate: true',
    'ingress:',
    `  - service: ${opts.origin}`,
    '    originRequest:',
    `      originServerName: ${JSON.stringify(opts.originServerName)}`,
    `      caPool: ${JSON.stringify(opts.caPool)}`,
    '      noTLSVerify: false',
    '',
  ].join('\n');
}

export class CloudflaredConnector implements TunnelConnector {
  private child: ChildProcess | null = null;
  private current: ConnectorState = 'stopped';
  private wanted: ConnectorOrigin | null = null;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: CloudflaredConnectorDeps) {}

  state(): ConnectorState {
    return this.current;
  }

  async start(opts: ConnectorOrigin): Promise<void> {
    this.wanted = opts;
    if (this.child && this.child.exitCode === null) await this.stopChild();
    this.spawnNow();
  }

  async stop(): Promise<void> {
    this.wanted = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    await this.stopChild();
    this.current = 'stopped';
  }

  private spawnNow() {
    const opts = this.wanted;
    if (!opts) return;
    if (!existsSync(this.deps.binary)) {
      this.current = 'failed';
      this.deps.logger.error({ binary: this.deps.binary }, "cloudflared isn't there; run pnpm fetch-binaries");
      return;
    }
    mkdirSync(this.deps.dir, { recursive: true, mode: 0o700 });
    chmodSync(this.deps.dir, 0o700);
    const configFile = join(this.deps.dir, 'cloudflared.yml');
    writeFileSync(configFile, connectorConfig(opts), { mode: 0o600 });
    const child = (this.deps.spawn ?? defaultSpawn)(
      this.deps.binary,
      ['tunnel', '--no-autoupdate', '--config', configFile, 'run'],
      // Its own home, so a cloudflared the person runs themselves never mixes with hlabs's.
      { env: { ...process.env, HOME: this.deps.dir } },
    );
    this.child = child;
    this.current = 'starting';
    this.deps.children?.add(child.pid, configFile);
    let tail = '';
    const onData = (chunk: Buffer | string) => {
      tail = (tail + chunk.toString()).slice(-4_000);
      if (this.current === 'starting' && /Registered tunnel connection/.test(tail)) {
        this.current = 'running';
        this.deps.logger.info({ pid: child.pid }, 'cloudflared is connected');
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('error', (err) => this.deps.logger.error({ err }, "cloudflared couldn't start"));
    child.once('exit', (code, signal) => {
      this.deps.children?.remove(child.pid);
      // Stopped or replaced on purpose.
      if (this.child !== child) return;
      this.child = null;
      if (!this.wanted) return;
      this.current = 'failed';
      this.deps.logger.error({ code, signal, tail: tail.slice(-1_000) }, 'cloudflared exited; starting it again');
      this.restartTimer = setTimeout(() => this.spawnNow(), this.deps.restartDelayMs ?? 5_000);
      this.restartTimer.unref();
    });
  }

  private async stopChild(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => (child.kill('SIGKILL'), resolve()), 5_000);
      child.once('exit', () => (clearTimeout(timer), resolve()));
      child.kill('SIGTERM');
    });
  }
}

const defaultSpawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) =>
  spawn(command, args, { env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
