// US-INST-22 on a Linux server, for real (D-144; CI's `install (Linux)` job, last): `sudo hlabs uninstall --keep-data
// --yes` removes hlabs and keeps /var/lib/hlabs; installed again, `install.sh --uninstall --delete-everything --yes`
// also deletes the data and the hlabs user. Docker stays.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve(import.meta.dirname, '../../../dist/linux');
const tarball = join(
  dist,
  readdirSync(dist).find((f) => f.endsWith('.tar.gz'))!,
);
const sudo = (args: string[]) => spawnSync('sudo', args, { encoding: 'utf8' });
const gone = (path: string) => sudo(['test', '-e', path]).status !== 0;

describe('US-INST-22 · uninstalling from a Linux server', () => {
  it('hlabs uninstall --keep-data removes hlabs and keeps the data', () => {
    const r = sudo(['hlabs', 'uninstall', '--keep-data', '--yes']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✓ Stopped every app');
    expect(r.stdout).toContain('✓ Removed systemd service hlabsd.service');
    expect(r.stdout).toContain('✓ Removed hlabs from /opt/hlabs');
    expect(r.stdout).toContain('✓ Kept your data in /var/lib/hlabs');
    expect(r.stdout).toContain('Docker Engine and Avahi stay installed.');
    for (const path of ['/opt/hlabs', '/usr/local/bin/hlabs', '/usr/lib/hlabs', '/etc/sudoers.d/hlabs']) {
      expect(gone(path), path).toBe(true);
    }
    expect(existsSync('/etc/systemd/system/hlabsd.service')).toBe(false);
    expect(sudo(['test', '-f', '/var/lib/hlabs/hlabs.db']).status).toBe(0);
    expect(spawnSync('id', ['hlabs']).status).toBe(0);
    expect(sudo(['docker', 'version']).status).toBe(0);
  });

  it('installed again, it keeps what was there; --delete-everything deletes the data and the user', () => {
    const again = sudo(['env', `HLABS_TARBALL=${tarball}`, 'sh', join(dist, 'install.sh')]);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('✓ Started hlabs');

    const r = sudo(['sh', join(dist, 'install.sh'), '--uninstall', '--delete-everything', '--yes']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✓ Deleted /var/lib/hlabs and the hlabs user');
    expect(gone('/var/lib/hlabs')).toBe(true);
    expect(spawnSync('id', ['hlabs']).status).not.toBe(0);
    expect(
      execFileSync('sudo', ['docker', 'network', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' }),
    ).not.toMatch(/^hlabs$/m);
  });

  it('run again, it says there is nothing to remove', () => {
    const r = sudo(['sh', join(dist, 'install.sh'), '--uninstall', '--keep-data', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("✗ hlabs isn't installed on this server");
  });
});
