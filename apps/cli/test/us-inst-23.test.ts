// US-INST-23 · Install hlabs on a Linux server with one command: the pieces of scripts/install.sh, run with `sh` against
// pretend commands (`uname`, `ss`, `id`, `openssl version`…) so they run anywhere. The whole install runs for real on
// a Linux runner in CI (us-inst-23.install.ts, D-140).
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../../../scripts/install.sh');

let dir: string;
let bin: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'us-inst-23-'));
  bin = join(dir, 'bin');
  mkdirSync(bin);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A pretend command on the test's PATH. */
function fake(name: string, body: string) {
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}

/** Runs `code` after sourcing install.sh, with the pretend commands first on PATH (or alone, with `only`). */
function sh(code: string, env: Record<string, string> = {}, only = false) {
  const r = spawnSync('/bin/sh', ['-c', `. "${SCRIPT}"; LOG="${dir}/install.log"; ${code}`], {
    encoding: 'utf8',
    env: {
      PATH: only ? bin : `${bin}:${process.env.PATH}`,
      HLABS_INSTALL_LIB: '1',
      HLABS_OS_RELEASE: join(dir, 'os-release'),
      HLABS_MEMINFO: join(dir, 'meminfo'),
      HLABS_SYSTEMD_DIR: dir,
      ...env,
    },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

function osRelease(fields: Record<string, string>) {
  writeFileSync(
    join(dir, 'os-release'),
    Object.entries(fields)
      .map(([k, v]) => `${k}="${v}"`)
      .join('\n'),
  );
}

function computer({ arch = 'x86_64', openssl = 'OpenSSL 3.0.13 30 Jan 2024' } = {}) {
  osRelease({ NAME: 'Ubuntu', ID: 'ubuntu', VERSION_ID: '24.04', VERSION_CODENAME: 'noble' });
  writeFileSync(join(dir, 'meminfo'), 'MemTotal:       16314284 kB\nMemFree:  1 kB\n');
  fake('uname', `echo ${arch}`);
  fake('openssl', `[ "$1" = version ] && echo "${openssl}"`);
  // 412 GB free on the disk /var/lib/hlabs is on.
  fake('df', 'printf "Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/sda1 1 1 402344000 1%% /\\n"');
}

describe('US-INST-23', () => {
  it('re-runs itself with sudo when not root, or says to', () => {
    fake('id', 'echo 1000');
    const r = sh('need_root', {}, true);
    expect(r.status).toBe(1);
    expect(r.err).toContain('✗ Run this as root or with sudo');

    // Piped from curl ($0 is "sh"), it fetches the script from the site again and runs it with sudo (both pretend).
    fake('sudo', 'cat >/dev/null; echo "sudo $*"');
    fake('curl', 'echo "curl $*" >&2');
    const piped = sh('need_root', { HLABS_TARBALL: '/tmp/x.tar.gz' }, true);
    expect(piped.status).toBe(0);
    expect(piped.err).toContain('https://hlabs.h4loom.com/install.sh');
    expect(piped.out).toContain('sudo env HLABS_VERSION= HLABS_TARBALL=/tmp/x.tar.gz sh -s --');
  });

  it('prints one line about the computer', () => {
    computer();
    const r = sh('check_system');
    expect(r.status).toBe(0);
    expect(r.out.trim()).toBe('✓ Ubuntu 24.04 · x86_64 · 16 GB memory · 412 GB free');
    fake('uname', 'echo aarch64');
    expect(sh('check_system').out).toContain('· arm64 ·');
  });

  it('stops with a clear message without systemd, on another architecture or without OpenSSL 3', () => {
    computer({ arch: 'i686' });
    let r = sh('check_system');
    expect(r.status).toBe(1);
    expect(r.err).toContain('✗ Ubuntu 24.04 · i686');
    expect(r.err).toContain('hlabs runs on x86_64 and arm64 computers, and this one is i686.');

    computer();
    r = sh('check_system', { HLABS_SYSTEMD_DIR: join(dir, 'no-systemd') });
    expect(r.status).toBe(1);
    expect(r.err).toContain("hlabs needs systemd, which this system doesn't run.");

    computer({ openssl: 'OpenSSL 1.1.1f  31 Mar 2020' });
    r = sh('check_system');
    expect(r.status).toBe(1);
    expect(r.err).toContain('hlabs needs OpenSSL 3');
  });

  it("names Docker's repository for each distribution, and asks for Docker where there's none", () => {
    const distro = (fields: Record<string, string>) => {
      osRelease(fields);
      return sh('docker_distro').out.trim();
    };
    expect(distro({ ID: 'ubuntu' })).toBe('ubuntu');
    expect(distro({ ID: 'linuxmint', ID_LIKE: 'ubuntu debian' })).toBe('ubuntu');
    expect(distro({ ID: 'raspbian', ID_LIKE: 'debian' })).toBe('debian');
    expect(distro({ ID: 'rocky', ID_LIKE: 'rhel centos fedora' })).toBe('rhel');
    expect(distro({ ID: 'arch' })).toBe('');

    osRelease({ ID: 'ubuntu', VERSION_CODENAME: 'noble', UBUNTU_CODENAME: 'noble' });
    expect(sh('docker_codename').out).toBe('noble');
    osRelease({ ID: 'linuxmint', ID_LIKE: 'ubuntu', VERSION_CODENAME: 'wilma', UBUNTU_CODENAME: 'noble' });
    expect(sh('docker_codename').out).toBe('noble');

    // No docker, apt or dnf.
    osRelease({ ID: 'arch' });
    for (const tool of ['cat', 'dirname', 'tr', 'sed', 'awk']) fake(tool, `exec /usr/bin/${tool} "$@"`);
    const r = sh('ensure_docker', {}, true);
    expect(r.out).toContain('Docker Engine not found, installing from the official repository');
    expect(r.status).toBe(1);
    expect(r.err).toContain('✗ Install Docker Engine first, then run this again');
    expect(r.err).toContain('https://docs.docker.com/engine/install/');
  });

  it('reuses a running Docker Engine', () => {
    fake('docker', 'echo 27.3.1');
    const r = sh('ensure_docker');
    expect(r.status).toBe(0);
    expect(r.out.trim()).toBe('✓ Docker Engine 27.3.1 found');
  });

  it('falls back to 8443 and 8080 for ports in use, and fails when both are taken', () => {
    const listening = (ports: Record<number, string>) =>
      fake(
        'ss',
        `for p in ${Object.keys(ports).join(' ')}; do
           case "$*" in *":$p\\""*|*":$p") ;; *) continue ;; esac
           case "$p" in ${Object.entries(ports)
             .map(
               ([p, name]) => `${p}) echo "LISTEN 0 511 0.0.0.0:${p} 0.0.0.0:* users:((\\"${name}\\",pid=1,fd=6))" ;;`,
             )
             .join(' ')} esac
         done`,
      );
    listening({ 443: 'nginx' });
    let r = sh('choose_ports; echo "$HTTPS_PORT $HTTP_PORT"; ports_phrase');
    expect(r.status).toBe(0);
    expect(r.out).toContain('! Port 443 is used by nginx, using 8443 instead');
    expect(r.out).toContain('8443 80\nports 80 and 8443');

    listening({ 80: 'apache2', 443: 'nginx' });
    r = sh('choose_ports; ports_phrase');
    expect(r.out).toContain('! Port 80 is used by apache2, using 8080 instead');
    expect(r.out).toContain('ports 8080 and 8443');

    listening({ 443: 'nginx', 8443: 'java' });
    r = sh('choose_ports');
    expect(r.status).toBe(1);
    expect(r.err).toContain('✗ Ports 443 and 8443 are both in use');
  });

  describe('checks the download (D-141)', () => {
    // A real OpenSSL 3 (Linux, or Homebrew's on a Mac); macOS's own LibreSSL can't check Ed25519.
    const openssl = ['openssl', '/opt/homebrew/opt/openssl@3/bin/openssl', '/usr/local/opt/openssl@3/bin/openssl'].find(
      (cmd) => /^OpenSSL [3-9]/.test(spawnSync(cmd, ['version'], { encoding: 'utf8' }).stdout ?? ''),
    );
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const keyId = randomBytes(8);

    /** A minisign signature as `tauri signer sign` writes it (base64 of the whole text). */
    const signature = (data: Buffer) => {
      const sig = sign(null, createHash('blake2b512').update(data).digest(), privateKey);
      const text = [
        'untrusted comment: signature from tauri secret key',
        Buffer.concat([Buffer.from('ED'), keyId, sig]).toString('base64'),
        'trusted comment: timestamp:1\tfile:x',
        sign(null, Buffer.concat([sig, Buffer.from('timestamp:1\tfile:x')]), privateKey).toString('base64'),
      ].join('\n');
      return Buffer.from(text).toString('base64');
    };

    /** A local build: the tarball with its `version`, SHA256SUMS and its signature. */
    const build = (change?: (files: { sums: string; sig: string }) => { sums?: string; sig?: string }) => {
      const stage = join(dir, 'stage');
      mkdirSync(stage, { recursive: true });
      writeFileSync(join(stage, 'version'), '1.2.3\n');
      const tarball = join(dir, 'hlabs-1.2.3-linux-x86_64.tar.gz');
      spawnSync('tar', ['-czf', tarball, '-C', stage, '.']);
      const hash = createHash('sha256').update(readFileSync(tarball)).digest('hex');
      let sums = `${hash}  hlabs-1.2.3-linux-x86_64.tar.gz\n`;
      let sig = signature(Buffer.from(sums));
      ({ sums = sums, sig = sig } = change?.({ sums, sig }) ?? {});
      writeFileSync(join(dir, 'SHA256SUMS'), sums);
      writeFileSync(join(dir, 'SHA256SUMS.sig'), sig);
      return tarball;
    };

    const fetch = (tarball: string) =>
      sh(`PUBLIC_KEY="${spki}"; WORK="${dir}/work"; mkdir -p "$WORK"; fetch_release && echo "version $VERSION"`, {
        HLABS_TARBALL: tarball,
        PATH: `${bin}:${join(openssl ?? 'openssl', '..')}:${process.env.PATH}`,
      });

    it.skipIf(!openssl)('accepts a signed download and reads its version', () => {
      fake('uname', 'echo x86_64');
      const r = fetch(build());
      expect(r.err).toBe('');
      expect(r.out).toContain('version 1.2.3');
    });

    it.skipIf(!openssl)('refuses a changed SHA256SUMS, another key and a tarball that does not match', () => {
      fake('uname', 'echo x86_64');
      // Always a different first character: a hash that starts with 0 would otherwise stay the same.
      let r = fetch(build(({ sums }) => ({ sums: sums.replace(/^./, (c) => (c === '0' ? '1' : '0')) })));
      expect(r.status).toBe(1);
      expect(r.err).toContain("✗ The download's signature doesn't match the hlabs key");

      const other = generateKeyPairSync('ed25519').privateKey;
      r = fetch(
        build(({ sums }) => {
          const s = sign(null, createHash('blake2b512').update(sums).digest(), other);
          const text = [
            'c',
            Buffer.concat([Buffer.from('ED'), keyId, s]).toString('base64'),
            'trusted comment: x',
            'x',
          ];
          return { sig: Buffer.from(text.join('\n')).toString('base64') };
        }),
      );
      expect(r.err).toContain("✗ The download's signature doesn't match the hlabs key");

      r = fetch(
        build(({ sums }) => {
          const changed = sums.replace(/^[0-9a-f]{64}/, '0'.repeat(64));
          return { sums: changed, sig: signature(Buffer.from(changed)) };
        }),
      );
      expect(r.status).toBe(1);
      expect(r.err).toContain("✗ hlabs-1.2.3-linux-x86_64.tar.gz doesn't match its checksum");
      expect(r.err).toContain('Nothing was installed');
    });
  });
});
