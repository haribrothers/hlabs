// Network mounts (D-060–D-062): passwords never on a command line, and errors mapped to NAS_* codes.
import { hlabsCodeOf } from '@hlabs/api';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LinuxNetworkMounter, MacNetworkMounter, type Exec, type ExecResult } from '../src/platform/network-mount';
import { tempDir } from './helpers';

function fakeExec(result: Partial<ExecResult> | ((cmd: string, args: string[]) => Partial<ExecResult>)) {
  const calls: Array<{ command: string; args: string[]; stdin?: string }> = [];
  const exec: Exec = async (command, args, opts) => {
    calls.push({ command, args, stdin: opts?.stdin });
    const r = typeof result === 'function' ? result(command, args) : result;
    return { code: 0, stdout: '', stderr: '', ...r };
  };
  return { exec, calls };
}

/** The `detail.reason` an hlabs error carries (on its HlabsError cause). */
const reasonOf = (err: unknown) => (err as { cause?: { detail?: { reason?: string } } }).cause?.detail?.reason;

const smb = { protocol: 'smb' as const, host: 'nas.local', share: 'media', username: 'hari', password: 's3cret pass' };

describe('macOS mounts', () => {
  it('SMB goes through the NetFS helper with the password on stdin, and returns where it mounted', async () => {
    const { exec, calls } = fakeExec({ stdout: '/Volumes/media\n' });
    const mountPoint = await new MacNetworkMounter('/bin/hlabs-netmount', exec).mount(smb, '/unused');
    expect(mountPoint).toBe('/Volumes/media');
    expect(calls[0]).toEqual({
      command: '/bin/hlabs-netmount',
      args: ['mount', 'smb://nas.local/media', 'hari'],
      stdin: 's3cret pass\n',
    });
    expect(JSON.stringify(calls[0]!.args)).not.toContain('s3cret');
  });

  it('maps NetFS errors', async () => {
    const codeFor = async (stderr: string, code = 2) => {
      const { exec } = fakeExec({ code, stderr });
      return new MacNetworkMounter('/h', exec).mount(smb, '/x').then(
        () => 'ok',
        (err: unknown) => [hlabsCodeOf(err), reasonOf(err)],
      );
    };
    expect(await codeFor('errno=80')).toEqual(['NAS_AUTH_FAILED', undefined]);
    expect(await codeFor('errno=2')).toEqual(['NAS_UNREACHABLE', 'noShare']);
    expect(await codeFor('errno=65')).toEqual(['NAS_UNREACHABLE', 'unreachable']);
    expect(await codeFor('', 127)).toEqual(['NAS_HELPER_MISSING', undefined]);
  });

  it('NFS mounts as the user and explains a NAS that wants system ports', async () => {
    const target = join(tempDir(), 'mnt');
    const { exec, calls } = fakeExec({
      code: 1,
      stderr: "mount_nfs: can't mount /media from nas: Operation not permitted",
    });
    const err = await new MacNetworkMounter('/h', exec)
      .mount({ protocol: 'nfs', host: 'nas.local', share: '/media' }, target)
      .catch((e: unknown) => e);
    expect(calls[0]!.command).toBe('/sbin/mount_nfs');
    expect(calls[0]!.args).toEqual(['-o', 'nosuid,nodev', 'nas.local:/media', target]);
    expect(hlabsCodeOf(err)).toBe('NAS_UNREACHABLE');
    expect(reasonOf(err)).toBe('privilegedPort');
  });
});

describe('Linux mounts', () => {
  it('SMB credentials go in a 0600 file that is deleted after the mount', async () => {
    const tmp = tempDir();
    let seen: { mode: number; text: string } | null = null;
    const { exec, calls } = fakeExec((_cmd, args) => {
      const file = args[5]!;
      seen = { mode: statSync(file).mode & 0o777, text: readFileSync(file, 'utf8') };
      return {};
    });
    const target = join(tempDir(), 'mounts', '01ABC');
    expect(await new LinuxNetworkMounter('/usr/lib/hlabs/hlabs-priv', tmp, exec).mount(smb, target)).toBe(target);
    expect(calls[0]!.command).toBe('sudo');
    expect(calls[0]!.args.slice(0, 5)).toEqual([
      '-n',
      '/usr/lib/hlabs/hlabs-priv',
      'mount-cifs',
      '//nas.local/media',
      target,
    ]);
    expect(JSON.stringify(calls[0]!.args)).not.toContain('s3cret');
    expect(seen).toEqual({ mode: 0o600, text: 'username=hari\npassword=s3cret pass\n' });
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('without the sudo rule the helper is reported missing; a bad login is NAS_AUTH_FAILED', async () => {
    const target = join(tempDir(), 'm');
    const missing = fakeExec({ code: 1, stderr: 'sudo: a password is required' });
    expect(
      hlabsCodeOf(await new LinuxNetworkMounter('/h', tempDir(), missing.exec).mount(smb, target).catch((e) => e)),
    ).toBe('NAS_HELPER_MISSING');
    const denied = fakeExec({ code: 32, stderr: 'mount error(13): Permission denied' });
    expect(
      hlabsCodeOf(await new LinuxNetworkMounter('/h', tempDir(), denied.exec).mount(smb, target).catch((e) => e)),
    ).toBe('NAS_AUTH_FAILED');
  });
});

describe('hlabs-priv allow-list (D-061)', () => {
  const script = fileURLToPath(new URL('../native/hlabs-priv', import.meta.url));
  const mounts = tempDir();
  const run = (...args: string[]) => {
    try {
      const out = execFileSync('sh', [script, ...args], {
        env: { ...process.env, HLABS_PRIV_DRY_RUN: '1', HLABS_MOUNTS_DIR: mounts, SUDO_USER: process.env.USER },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true, out: out.toString().trim() };
    } catch (err) {
      return { ok: false, out: String((err as { stderr: Buffer }).stderr) };
    }
  };

  it('runs only the allowed mount commands on targets directly inside the mounts folder', () => {
    const creds = join(tempDir(), 'c');
    writeFileSync(creds, '');
    expect(run('mount-nfs', 'nas.local:/media', join(mounts, '01ABC'))).toEqual({
      ok: true,
      out: `mount -t nfs nas.local:/media ${join(mounts, '01ABC')} -o nosuid,nodev,noexec`,
    });
    expect(run('mount-cifs', '//nas.local/media', join(mounts, '01ABC'), creds).out).toMatch(
      /^mount -t cifs \/\/nas.local\/media .*credentials=/,
    );
    expect(run('umount', join(mounts, '01ABC')).ok).toBe(true);
  });

  it('refuses anything else', () => {
    expect(run('rm', '-rf', '/').ok).toBe(false);
    expect(run('umount', '/etc').ok).toBe(false);
    expect(run('umount', join(mounts, '..', 'etc')).ok).toBe(false);
    expect(run('umount', join(mounts, 'a', 'b')).ok).toBe(false);
    expect(run('mount-nfs', 'nas;reboot:/x', join(mounts, 'a')).ok).toBe(false);
    expect(run('mount-cifs', '//nas/media', join(mounts, 'a'), '/no/such/file').ok).toBe(false);
    expect(existsSync(join(mounts, 'a'))).toBe(false);
  });
});
