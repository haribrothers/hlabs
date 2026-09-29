// Publishes `hlabs.local` and `<app>.hlabs.local` on the LAN (02 §2.6). Each name is held by one long-running
// process: `dns-sd -P` on macOS, `avahi-publish -a -R` on Linux (D-074). Both register a host record for this
// computer's LAN address for as long as the process lives, so withdrawing a name is stopping its process. A process
// that dies is started again, and every name moves when the LAN address changes.
import { spawn as nodeSpawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import type { Logger } from '../logger';
import type { MdnsPublisher } from './index';

export interface Child {
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  once(event: 'error', listener: (err: Error) => void): unknown;
}

export type Spawn = (file: string, args: string[]) => Child;

export interface ProcessMdnsDeps {
  logger: Logger;
  /** The command that holds one name at one address. */
  command: (name: string, address: string) => { file: string; args: string[] };
  /** This computer's LAN IPv4 address, or null when there is none. */
  address?: () => string | null;
  spawn?: Spawn;
  restartDelayMs?: number;
  /** How often to look for a changed LAN address. */
  addressCheckMs?: number;
}

/** macOS: a proxy registration, which adds the A record for `<name>` (the service itself is incidental). */
export function dnsSdCommand(httpsPort: () => number) {
  return (name: string, address: string) => ({
    file: 'dns-sd',
    args: ['-P', name.replace(/\.local$/, ''), '_https._tcp', 'local', String(httpsPort()), name, address],
  });
}

/** Linux: an address record without the reverse (PTR) entry, so several names can share one address. */
export function avahiCommand(name: string, address: string) {
  return { file: 'avahi-publish', args: ['-a', '-R', name, address] };
}

const VIRTUAL = /^(lo|docker|br-|veth|virbr|vmnet|vboxnet|utun|bridge|tailscale|tun|tap|zt|awdl|llw|anpi|ap\d)/;

/** The LAN IPv4 address: wired and Wi-Fi interfaces first, never loopback, container bridges or VPNs. */
export function lanAddress(interfaces = networkInterfaces()): string | null {
  const candidates = Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([name, addrs]) =>
      (addrs ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })),
    )
    .filter((c) => !c.address.startsWith('169.254.'));
  const rank = (name: string) => (/^(en|eth)/.test(name) ? 0 : /^(wl|wlan)/.test(name) ? 1 : 2);
  candidates.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  return candidates[0]?.address ?? null;
}

export class ProcessMdnsPublisher implements MdnsPublisher {
  private readonly held = new Map<string, { child: Child; address: string }>();
  private wanted = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private missingLogged = false;

  constructor(private readonly deps: ProcessMdnsDeps) {}

  async sync(names: string[]): Promise<void> {
    this.wanted = new Set(names);
    for (const name of [...this.held.keys()]) if (!this.wanted.has(name)) this.withdraw(name);
    const address = this.address();
    for (const name of this.wanted) {
      const current = this.held.get(name);
      if (current && current.address === address) continue;
      if (current) this.withdraw(name);
      if (address) this.publish(name, address);
    }
    if (!address && names.length) this.deps.logger.warn('no LAN address yet; hostnames are not published');
    this.timer ??= setInterval(() => void this.sync([...this.wanted]), this.deps.addressCheckMs ?? 30_000);
    this.timer.unref?.();
  }

  async unpublishAll(): Promise<void> {
    this.wanted.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const name of [...this.held.keys()]) this.withdraw(name);
  }

  /** Names held right now (tests, diagnostics). */
  get published(): string[] {
    return [...this.held.keys()];
  }

  private address(): string | null {
    return (this.deps.address ?? lanAddress)();
  }

  private publish(name: string, address: string) {
    const { file, args } = this.deps.command(name, address);
    const child = (this.deps.spawn ?? defaultSpawn)(file, args);
    const entry = { child, address };
    this.held.set(name, entry);
    child.once('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT' && !this.missingLogged) {
        this.missingLogged = true;
        this.deps.logger.error({ file }, `${file} isn't installed; hostnames are not published`);
      }
    });
    child.once('exit', (code) => {
      if (this.held.get(name) !== entry) return;
      this.held.delete(name);
      if (!this.wanted.has(name) || this.missingLogged) return;
      this.deps.logger.warn({ name, code }, 'mDNS publisher stopped; publishing again');
      const timer = setTimeout(() => void this.sync([...this.wanted]), this.deps.restartDelayMs ?? 5_000);
      timer.unref?.();
    });
    this.deps.logger.debug({ name, address }, 'publishing mDNS name');
  }

  private withdraw(name: string) {
    const entry = this.held.get(name);
    this.held.delete(name);
    entry?.child.kill('SIGTERM');
  }
}

const defaultSpawn: Spawn = (file, args) => nodeSpawn(file, args, { stdio: 'ignore' });

export function createMdnsPublisher(logger: Logger, httpsPort: () => number): MdnsPublisher {
  return new ProcessMdnsPublisher({
    logger,
    command: process.platform === 'darwin' ? dnsSdCommand(httpsPort) : avahiCommand,
  });
}
