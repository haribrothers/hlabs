// US-INST-24 · Finish setup in the browser after the Linux install, for real (CI's `install (Linux)` job, after
// us-inst-23.install.ts installed hlabs): the installer ends with the setup addresses and the commands for later, the
// printed address opens setup, and `hlabs setup-url` prints it again for root and the hlabs group only.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve(import.meta.dirname, '../../../dist/linux');
const tarball = join(
  dist,
  readdirSync(dist).find((f) => f.endsWith('.tar.gz'))!,
);
const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8' });

describe('US-INST-24', () => {
  it('the installer ends with where to finish setup and the commands for later', () => {
    const r = sh('sudo', ['env', `HLABS_TARBALL=${tarball}`, 'sh', join(dist, 'install.sh')]);
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n');
    // Avahi is installed by the script; a runner without multicast says the name isn't available instead.
    expect(r.stdout).toMatch(
      /✓ Announced [a-z0-9-]+\.local on your network|! The \.local name isn't available on this network/,
    );
    const finish = lines.indexOf('Finish setup in your browser:');
    expect(finish).toBeGreaterThan(0);
    const addresses = lines.slice(finish + 1, -1);
    expect(addresses.length).toBeGreaterThan(0);
    for (const [i, line] of addresses.entries()) {
      expect(line).toMatch(new RegExp(`^  ${i === 0 ? '' : 'or '}http://[^/]+/setup\\?token=[A-Za-z0-9_-]{43}$`));
    }
    expect(lines.at(-1)).toBe('Manage later with: hlabs status · hlabs logs · hlabs setup-url · hlabs reset-password');

    // The IP address opens setup (Caddy serves the dashboard on plain HTTP until onboarding is done, D-013).
    const ip = addresses.map((l) => l.replace(/^ {2}(or )?/, '')).find((u) => /^http:\/\/\d/.test(u))!;
    expect(execFileSync('curl', ['-fsS', ip], { encoding: 'utf8' })).toContain('<html');

    // Printed again later, with the same token.
    const again = execFileSync('sudo', ['hlabs', 'setup-url'], { encoding: 'utf8' });
    expect(again).toContain(ip);
  });

  it('`hlabs setup-url` works for root and the hlabs group, and says what to do for anyone else', () => {
    const me = userInfo().username;
    const denied = sh('hlabs', ['setup-url']);
    expect(denied.status).toBe(77);
    expect(denied.stderr.trim()).toBe('Run with sudo or add yourself to the hlabs group');

    execFileSync('sudo', ['usermod', '-aG', 'hlabs', me]);
    try {
      // sg runs it with the hlabs group, as a new login would.
      const member = sh('sg', ['hlabs', '-c', 'hlabs setup-url']);
      expect(member.stderr).toBe('');
      expect(member.stdout).toContain('Finish setup in your browser:');
    } finally {
      execFileSync('sudo', ['gpasswd', '-d', me, 'hlabs']);
    }
  });
});
