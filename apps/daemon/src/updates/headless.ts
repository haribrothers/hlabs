// hlabs updating itself on a headless Linux server (US-SYS-23, 02 §2.10, D-034): versions side by side under the
// install root (`/opt/hlabs/<version>`) with a `current` symlink that systemd starts. An update is downloaded, its
// SHA-256 and signature checked (UPDATE_SIGNATURE_INVALID: nothing is installed), unpacked beside the running version,
// and `current` switched; a marker (`switch.json`) remembers the switch until the new version is ready. If it isn't
// ready within 3 minutes, the start check (`hlabsd --update-watchdog`, systemd's ExecStartPre, D-118) switches
// `current` back. Then systemd restarts hlabsd: the daemon exits with EXIT_RESTART and the unit restarts it.
import { hlabsError } from '@hlabs/api';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { verifySignature } from './signature';
import type { PlatformDownload } from './source';

/** How long a new version has to become ready before the start check switches back. */
export const SWITCH_BACK_AFTER_MS = 3 * 60_000;
export const CURRENT = 'current';
export const SWITCH_MARKER = 'switch.json';

export interface SwitchMarker {
  from: string;
  to: string;
  at: number;
}

export interface HeadlessHost {
  /** Downloads `url` to `dest`. */
  download(url: string, dest: string, signal: AbortSignal): Promise<void>;
  /** Unpacks a .tar.gz into `dir` (which exists and is empty). */
  extract(tarball: string, dir: string): Promise<void>;
  /** Asks systemd to start hlabsd again (the new `current`). */
  restart(): void;
}

/** The headless download for this machine's architecture in a release's platforms (D-118). */
export const headlessPlatform = (arch: string = process.arch) =>
  `hlabsd-linux-${arch === 'arm64' ? 'aarch64' : 'x86_64'}`;

/** The version `current` points at, or null without one. */
export function currentVersion(root: string): string | null {
  try {
    return basename(readlinkSync(join(root, CURRENT)));
  } catch {
    return null;
  }
}

/** Points `current` at a version, atomically (a new link renamed over the old one). */
export function pointCurrent(root: string, version: string): void {
  const next = join(root, `${CURRENT}.next`);
  rmSync(next, { force: true });
  symlinkSync(version, next);
  renameSync(next, join(root, CURRENT));
}

export function readMarker(root: string): SwitchMarker | null {
  try {
    return JSON.parse(readFileSync(join(root, SWITCH_MARKER), 'utf8')) as SwitchMarker;
  } catch {
    return null;
  }
}

/** The new version is ready: the switch stays. */
export function confirmSwitch(root: string): void {
  rmSync(join(root, SWITCH_MARKER), { force: true });
}

/**
 * The start check (ExecStartPre): a switch that was never confirmed and is older than 3 minutes is undone. Returns
 * what it did, for the log.
 */
export function switchBackIfStale(root: string, now = Date.now()): 'none' | 'waiting' | 'switched-back' {
  const marker = readMarker(root);
  if (!marker) return 'none';
  if (now - marker.at < SWITCH_BACK_AFTER_MS) return 'waiting';
  if (existsSync(join(root, marker.from))) pointCurrent(root, marker.from);
  writeFileSync(join(root, 'switched-back.json'), JSON.stringify({ ...marker, switchedBackAt: now }));
  confirmSwitch(root);
  return 'switched-back';
}

export interface ApplyHeadlessInput {
  root: string;
  version: string;
  download: PlatformDownload;
  publicKey: string;
  host: HeadlessHost;
  signal: AbortSignal;
  report: (progress: number, message?: string) => void;
  now?: () => number;
}

/** Downloads, checks and installs a version beside the running one and switches to it; the caller then restarts. */
export async function applyHeadless(input: ApplyHeadlessInput): Promise<void> {
  const { root, version, download, host, report } = input;
  const from = currentVersion(root);
  if (!from) throw hlabsError('UPDATE_NOT_APPLIED', `no ${CURRENT} link in ${root}`);
  const work = join(root, `.download-${version}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const tarball = join(work, 'hlabsd.tar.gz');
    report(5, 'Downloading');
    try {
      await host.download(download.url, tarball, input.signal);
    } catch (err) {
      throw hlabsError('UPDATE_DOWNLOAD_FAILED', (err as Error).message);
    }
    report(60, 'Checking');
    const data = readFileSync(tarball);
    const sha256 = createHash('sha256').update(data).digest('hex');
    if (download.sha256 && sha256 !== download.sha256.toLowerCase()) {
      throw hlabsError('UPDATE_SIGNATURE_INVALID', 'checksum mismatch');
    }
    if (!verifySignature(data, download.signature, input.publicKey)) {
      throw hlabsError('UPDATE_SIGNATURE_INVALID', 'signature mismatch');
    }
    report(75, 'Installing');
    const unpacked = join(work, 'unpacked');
    mkdirSync(unpacked);
    await host.extract(tarball, unpacked);
    const target = join(root, version);
    if (version !== from) rmSync(target, { recursive: true, force: true });
    renameSync(unpacked, target);
    writeFileSync(
      join(root, SWITCH_MARKER),
      JSON.stringify({ from, to: version, at: (input.now ?? Date.now)() } satisfies SwitchMarker),
    );
    pointCurrent(root, version);
    report(95, 'Restarting');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** A switch the start check undid (switchBackIfStale), once: read and removed. */
export function takeSwitchedBack(root: string): SwitchMarker | null {
  const file = join(root, 'switched-back.json');
  try {
    const marker = JSON.parse(readFileSync(file, 'utf8')) as SwitchMarker;
    rmSync(file, { force: true });
    return marker;
  } catch {
    return null;
  }
}
