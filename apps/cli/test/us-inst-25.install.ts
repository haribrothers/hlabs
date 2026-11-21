// US-INST-25 · Manage a headless install from the command line, for real (CI's `install (Linux)` job, after hlabs was
// installed by us-inst-23.install.ts): `hlabs status`, `hlabs logs` and `hlabs reset-password` with sudo, as a member
// of the hlabs group and as anyone else.
import { execFileSync, spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { describe, expect, it } from 'vitest';

const sh = (cmd: string, args: string[], input?: string) => spawnSync(cmd, args, { encoding: 'utf8', input });
const asMember = <T>(fn: () => T): T => {
  const me = userInfo().username;
  execFileSync('sudo', ['usermod', '-aG', 'hlabs', me]);
  try {
    return fn();
  } finally {
    execFileSync('sudo', ['gpasswd', '-d', me, 'hlabs']);
  }
};
const ready = () => {
  for (let i = 0; i < 60; i++) {
    if (sh('curl', ['-fsS', '-o', '/dev/null', 'http://127.0.0.1:7474/healthz']).status === 0) return;
    execFileSync('sleep', ['1']);
  }
  throw new Error('hlabs did not come back');
};

describe('US-INST-25', () => {
  it('hlabs status: what hlabs is doing, 0 when running and 2 when it is stopped', () => {
    const r = sh('sudo', ['hlabs', 'status']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines[0]).toBe('hlabs · Running · no apps');
    expect(lines[1]).toMatch(/^CPU \d+% · Memory [\d.]+ GB · Free [\d.]+ [GT]B$/);
    expect(lines).toContain('Backups: not set up');
    expect(lines).toContain("Setup isn't finished: run hlabs setup-url");

    expect(asMember(() => sh('sg', ['hlabs', '-c', 'hlabs status']).status)).toBe(0);
    const denied = sh('hlabs', ['status']);
    expect(denied.status).toBe(77);
    expect(denied.stderr.trim()).toBe('Run with sudo or add yourself to the hlabs group');

    execFileSync('sudo', ['systemctl', 'stop', 'hlabsd']);
    try {
      const down = sh('sudo', ['hlabs', 'status']);
      expect(down.status).toBe(2);
      expect(down.stdout.trim()).toBe("hlabs · Can't reach hlabs");
    } finally {
      execFileSync('sudo', ['systemctl', 'start', 'hlabsd']);
      ready();
    }
  });

  it("hlabs logs: the daemon's log for root and the hlabs group, and an app's logs", () => {
    const r = sh('sudo', ['hlabs', 'logs']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d {2}(INFO|WARN|ERROR|DEBUG) /m);

    expect(asMember(() => sh('sg', ['hlabs', '-c', 'hlabs logs']).stdout)).toMatch(/ {2}INFO /);
    expect(sh('hlabs', ['logs']).stderr.trim()).toBe('Run with sudo or add yourself to the hlabs group');

    const app = sh('sudo', ['hlabs', 'logs', '--app', 'immich']);
    expect(app.status).toBe(1);
    expect(app.stderr.trim()).toBe('There\'s no app called "immich" on this hlabs');
  });

  it('hlabs reset-password: root only, and says to finish setup when there are no accounts yet', () => {
    expect(asMember(() => sh('sg', ['hlabs', '-c', 'hlabs reset-password']).stderr.trim())).toBe(
      'Run with sudo to reset a password',
    );
    const r = sh('sudo', ['hlabs', 'reset-password'], '');
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toBe('There are no accounts yet. Finish setup first: hlabs setup-url');
  });
});
