// Network shares (US-ONB-16, US-FILE-11). macOS: SMB through the NetFS helper hlabs-netmount (password on stdin,
// mounts in /Volumes, D-060), NFS with mount_nfs as the user (D-062). Linux: the privileged helper hlabs-priv via
// `sudo -n`, with SMB credentials in a 0600 file deleted after the mount (D-061). Behind an interface for tests.
import { hlabsError } from '@hlabs/api';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface NetworkShare {
  protocol: 'smb' | 'nfs';
  host: string;
  /** "media" or "volume1/media" (SMB); "/export/media" (NFS). */
  share: string;
  username?: string;
  password?: string;
}

export interface NetworkMounter {
  /** Mounts the share and returns where. `target` is used where the platform allows it (not macOS SMB). */
  mount(share: NetworkShare, target: string): Promise<string>;
  unmount(mountPoint: string): Promise<void>;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command without a shell; `stdin` is written and closed. Never rejects: the code tells. */
export type Exec = (command: string, args: string[], opts?: { stdin?: string }) => Promise<ExecResult>;

export const nodeExec: Exec = (command, args, opts) =>
  new Promise((resolve) => {
    const child = execFile(command, args, { timeout: 60_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 127) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end(opts?.stdin ?? '');
  });

type Reason = 'unreachable' | 'noShare' | 'privilegedPort';
const unreachable = (reason: Reason) => hlabsError('NAS_UNREACHABLE', reason, { reason });

/** NetFS errno (hlabs-netmount) → hlabs code. */
export function netfsError(errno: number) {
  if (errno === 80 || errno === 13) return hlabsError('NAS_AUTH_FAILED'); // EAUTH, EACCES
  if (errno === 2) return unreachable('noShare'); // ENOENT
  return unreachable('unreachable'); // EHOSTUNREACH, ETIMEDOUT, ECONNREFUSED, …
}

/** mount / mount_nfs / mount.cifs messages → hlabs code. */
export function mountMessageError(stderr: string, protocol: NetworkShare['protocol']) {
  const text = stderr.toLowerCase();
  if (/a password is required|sudo:|hlabs-priv: no such file|command not found/.test(text)) {
    return hlabsError('NAS_HELPER_MISSING');
  }
  if (protocol === 'smb' && /permission denied|mount error\(13\)|logon failure|authentication/.test(text)) {
    return hlabsError('NAS_AUTH_FAILED');
  }
  if (protocol === 'nfs' && /permission denied|operation not permitted|not permitted|illegal port/.test(text)) {
    return unreachable('privilegedPort');
  }
  if (/no such file|mount error\(2\)|does not exist|not exported/.test(text)) return unreachable('noShare');
  return unreachable('unreachable');
}

const encodePath = (share: string) =>
  share
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');

export class MacNetworkMounter implements NetworkMounter {
  constructor(
    private readonly helper: string,
    private readonly exec: Exec = nodeExec,
  ) {}

  async mount(share: NetworkShare, target: string): Promise<string> {
    if (share.protocol === 'smb') {
      const url = `smb://${encodeURIComponent(share.host)}/${encodePath(share.share)}`;
      const args = ['mount', url, ...(share.username ? [share.username] : [])];
      const res = await this.exec(this.helper, args, { stdin: share.username ? `${share.password ?? ''}\n` : '' });
      if (res.code === 127) throw hlabsError('NAS_HELPER_MISSING');
      const errno = res.stderr.match(/errno=(\d+)/);
      if (res.code !== 0) throw errno ? netfsError(Number(errno[1])) : unreachable('unreachable');
      return res.stdout.trim();
    }
    await mkdir(target, { recursive: true });
    const res = await this.exec('/sbin/mount_nfs', ['-o', 'nosuid,nodev', `${share.host}:${share.share}`, target]);
    if (res.code !== 0) throw mountMessageError(res.stderr, 'nfs');
    return target;
  }

  async unmount(mountPoint: string): Promise<void> {
    const res = await this.exec('/usr/sbin/diskutil', ['unmount', mountPoint]);
    if (res.code !== 0) await this.exec('/sbin/umount', [mountPoint]);
  }
}

export class LinuxNetworkMounter implements NetworkMounter {
  constructor(
    private readonly helper: string,
    /** Where the credentials file is written (0600), inside the data dir. */
    private readonly tmpDir: string,
    private readonly exec: Exec = nodeExec,
  ) {}

  async mount(share: NetworkShare, target: string): Promise<string> {
    await mkdir(target, { recursive: true });
    if (share.protocol === 'nfs') {
      const res = await this.exec('sudo', ['-n', this.helper, 'mount-nfs', `${share.host}:${share.share}`, target]);
      if (res.code !== 0) throw mountMessageError(res.stderr, 'nfs');
      return target;
    }
    await mkdir(this.tmpDir, { recursive: true, mode: 0o700 });
    const credentials = join(this.tmpDir, `cifs-${process.pid}-${Date.now()}`);
    await writeFile(credentials, `username=${share.username ?? 'guest'}\npassword=${share.password ?? ''}\n`, {
      mode: 0o600,
    });
    try {
      const source = `//${share.host}/${share.share.replace(/^\/+/, '')}`;
      const res = await this.exec('sudo', ['-n', this.helper, 'mount-cifs', source, target, credentials]);
      if (res.code !== 0) throw mountMessageError(res.stderr, 'smb');
      return target;
    } finally {
      await rm(credentials, { force: true });
    }
  }

  async unmount(mountPoint: string): Promise<void> {
    await this.exec('sudo', ['-n', this.helper, 'umount', mountPoint]);
  }
}
