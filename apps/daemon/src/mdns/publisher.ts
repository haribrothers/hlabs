// Publishes `hlabs.local` and `<app>.hlabs.local` on the LAN (02 §2.6). Each name is held by one long-running
// process: `dns-sd -P` on macOS, `avahi-publish -a -R` on Linux (D-074). Both register a host record for this
// computer's LAN address for as long as the process lives, so withdrawing a name is stopping its process. A process
// that dies is started again, and every name moves when the LAN address changes.
import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildRegistry } from '../platform/children';
import { networkInterfaces } from 'node:os';
import type { Logger } from '../logger';
import type { MdnsPublisher } from './index';

export interface Child {
  /** Undefined when it couldn't start. */
  pid?: number;
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
  /** A publisher that stops sooner than this after starting failed (a name taken on the LAN, a refusal). */
  stableMs?: number;
  now?: () => number;
  /** Records each publisher, so a killed daemon's are ended at the next start. */
  children?: ChildRegistry;
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
  return lanAddresses(interfaces)[0] ?? null;
}

/** Every LAN IPv4 address, best first (US-SYS-01 lists them when the name can't be published). */
export function lanAddresses(interfaces = networkInterfaces()): string[] {
  const candidates = Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([name, addrs]) =>
      (addrs ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })),
    )
    .filter((c) => !c.address.startsWith('169.254.'));
  const rank = (name: string) => (/^(en|eth)/.test(name) ? 0 : /^(wl|wlan)/.test(name) ? 1 : 2);
  candidates.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  return [...new Set(candidates.map((c) => c.address))];
}

/** How long a publisher must run before its name counts as published again. */
const STABLE_MS = 10_000;

export class ProcessMdnsPublisher implements MdnsPublisher {
  private readonly held = new Map<string, { child: Child; address: string; startedAt: number }>();
  private wanted = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private missingLogged = false;
  /** Names whose last publisher stopped soon after it started. */
  private readonly failing = new Set<string>();

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

  isPublished(name: string): boolean {
    return !this.missingLogged && this.address() !== null && this.held.has(name) && !this.failing.has(name);
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
    this.deps.children?.add(child.pid, `${file} ${args.join(' ')}`.slice(0, 200));
    const now = this.deps.now ?? Date.now;
    const entry = { child, address, startedAt: now() };
    this.held.set(name, entry);
    // Still up after a while: the name is published again.
    const stable = setTimeout(() => {
      if (this.held.get(name) === entry) this.failing.delete(name);
    }, this.deps.stableMs ?? STABLE_MS);
    stable.unref?.();
    child.once('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT' && !this.missingLogged) {
        this.missingLogged = true;
        this.deps.logger.error({ file }, `${file} isn't installed; hostnames are not published`);
      }
    });
    child.once('exit', (code) => {
      this.deps.children?.remove(child.pid);
      if (this.held.get(name) !== entry) return;
      this.held.delete(name);
      if (now() - entry.startedAt < (this.deps.stableMs ?? STABLE_MS)) this.failing.add(name);
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
    this.failing.delete(name);
    entry?.child.kill('SIGTERM');
  }
}

const defaultSpawn: Spawn = (file, args) => nodeSpawn(file, args, { stdio: 'ignore' });

export function createMdnsPublisher(logger: Logger, httpsPort: () => number, children?: ChildRegistry): MdnsPublisher {
  return new ProcessMdnsPublisher({
    logger,
    children,
    command: process.platform === 'darwin' ? dnsSdCommand(httpsPort) : avahiCommand,
  });
}
