// US-INST-23 · Install hlabs on a Linux server with one command, for real (CI's `install (Linux)` job, D-140): the
// built install.sh with the built tarball, on a runner with systemd and Docker.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve(import.meta.dirname, '../../../dist/linux');
const tarball = join(
  dist,
  readdirSync(dist).find((f) => f.endsWith('.tar.gz'))!,
);
const version = /^hlabs-(.+)-linux-/.exec(tarball.split('/').at(-1)!)![1]!;

const install = () => {
  const r = spawnSync('sudo', ['env', `HLABS_TARBALL=${tarball}`, 'sh', join(dist, 'install.sh')], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    const log = spawnSync('sudo', ['cat', '/var/log/hlabs-install.log'], { encoding: 'utf8' }).stdout;
    throw new Error(`install.sh failed (${r.status}):\n${r.stdout}\n${r.stderr}\n--- log ---\n${log}`);
  }
  return r.stdout;
};
const root = (cmd: string, args: string[]) => execFileSync('sudo', [cmd, ...args], { encoding: 'utf8' }).trim();
const mode = (path: string) => root('stat', ['-c', '%U:%G %a', path]);
/** The HTTP status of a fresh request (no kept-alive connection to a daemon the install restarted). */
const status = (url: string) =>
  execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], { encoding: 'utf8' });
const body = (url: string) => execFileSync('curl', ['-fsS', url], { encoding: 'utf8' });

describe('US-INST-23', () => {
  it('installs, starts and answers', () => {
    const out = install();
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('hlabs installer');
    expect(lines[1]).toMatch(/^✓ Ubuntu \d+\.\d+ · (x86_64|arm64) · \d+ GB memory · \d+ GB free$/);
    // A runner has Docker; a clean server gets it from Docker's repository.
    expect(out).toMatch(/✓ (Docker Engine [\d.]+ found|Installed Docker Engine [\d.]+)/);
    expect(out).toContain('✓ Created the hlabs user and its data folder /var/lib/hlabs');
    expect(out).toContain('✓ Installed systemd service hlabsd.service (starts on boot)');
    expect(out).toContain('✓ Started hlabs · proxy on ports 80 and 443');

    expect(mode('/var/lib/hlabs')).toBe('hlabs:hlabs 750');
    expect(mode('/var/lib/hlabs/storage')).toBe('hlabs:hlabs 750');
    expect(mode('/var/lib/hlabs/tray.token')).toBe('hlabs:hlabs 640');
    expect(mode('/var/lib/hlabs/secret.key')).toBe('hlabs:hlabs 600');
    expect(mode('/usr/lib/hlabs/hlabs-priv')).toBe('root:root 755');
    expect(root('readlink', ['/opt/hlabs/current'])).toBe(version);
    expect(root('readlink', ['/usr/local/bin/hlabs'])).toBe('/opt/hlabs/current/bin/hlabs');
    expect(root('id', ['-nG', 'hlabs']).split(' ')).toContain('docker');
    expect(root('systemctl', ['is-enabled', 'hlabsd'])).toBe('enabled');
    expect(root('systemctl', ['show', 'hlabsd', '-p', 'User', '--value'])).toBe('hlabs');
    expect(root('visudo', ['-cf', '/etc/sudoers.d/hlabs'])).toContain('parsed OK');

    expect(status('http://127.0.0.1:7474/healthz')).toBe('200');
    // Caddy on port 80 serves the dashboard until onboarding is done (D-013).
    expect(body('http://127.0.0.1/')).toContain('<html');
    expect(statSync('/usr/local/bin/hlabs').isFile()).toBe(true);
  });

  it('a second run upgrades in place and keeps the data', () => {
    const db = root('stat', ['-c', '%i', '/var/lib/hlabs/hlabs.db']);
    const token = root('cat', ['/var/lib/hlabs/tray.token']);
    const out = install();
    expect(out).toContain(`✓ Reinstalled hlabs ${version}`);
    expect(out).not.toContain('Created the hlabs user');
    expect(root('stat', ['-c', '%i', '/var/lib/hlabs/hlabs.db'])).toBe(db);
    expect(root('cat', ['/var/lib/hlabs/tray.token'])).toBe(token);
    expect(status('http://127.0.0.1:7474/healthz')).toBe('200');
    expect(readFileSync('/etc/systemd/system/hlabsd.service', 'utf8')).toContain(
      'AmbientCapabilities=CAP_NET_BIND_SERVICE',
    );
  });
});
