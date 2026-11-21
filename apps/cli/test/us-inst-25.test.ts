// US-INST-25 · Manage a headless install from the command line: `hlabs status` says what the tray's status line and
// stats say and exits 0 running, 1 degraded, 2 unreachable; `hlabs logs` shows the daemon's log (and follows it) or one
// app's container logs; `hlabs reset-password` is root only, asks for the account, the password twice and two-factor,
// then resets it from the command line. Against a pretend hlabsd (helpers.ts).
import type { TrayStatus } from '@hlabs/api';
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatLine } from '../src/logs';
import { ago } from '../src/status';
import { PretendHlabs } from './helpers';

let hlabs: PretendHlabs;
beforeEach(() => {
  hlabs = new PretendHlabs();
});
afterEach(() => hlabs.close());

const HOUR = 3_600_000;
const NOW = new Date(2026, 10, 21, 12).getTime();
const GIB = 1024 ** 3;

function trayStatus(over: Partial<TrayStatus> = {}): TrayStatus {
  return {
    state: 'running',
    appsRunning: 11,
    appsExpected: 11,
    appsNeedAttention: 0,
    startupLogAppId: null,
    paused: false,
    cpuPercent: 12.4,
    memoryUsedBytes: 6.1 * GIB,
    freeBytes: 420e9,
    engine: { name: 'docker-engine', running: true, managedByHlabs: false, canStart: false },
    dashboardUrl: 'https://homeserver.local',
    backup: { configured: true, lastSucceededAt: NOW - 3 * HOUR, running: false, progress: null, lastFailed: false },
    startAtLogin: true,
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    updateRequested: null,
    portProblem: null,
    onboardingComplete: true,
    reduceTransparency: false,
    ...over,
  };
}

const status = async (over: Partial<TrayStatus> = {}) => {
  await hlabs.start({ 'tray.status': () => trayStatus(over) });
  return hlabs.cli(['status'], { now: () => NOW });
};

describe('US-INST-25 · hlabs status', () => {
  it('prints the tray status line and stats, and exits 0 when running', async () => {
    expect(await status()).toMatchObject({
      code: 0,
      out: [
        'hlabs · Running · 11 apps',
        'CPU 12% · Memory 6.1 GB · Free 420 GB',
        'Last backup: 3 hours ago',
        'Dashboard: https://homeserver.local',
      ].join('\n'),
    });
  });

  it('exits 1 when something needs looking at, and says what', async () => {
    let r = await status({ appsRunning: 10, appsNeedAttention: 1 });
    expect(r.code).toBe(1);
    expect(r.out).toContain('hlabs · Running · 10 of 11 apps · 1 needs attention');

    r = await status({
      state: 'engineStopped',
      engine: { name: 'docker-engine', running: false, managedByHlabs: false, canStart: false },
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("hlabs · Container engine stopped\nDocker Engine isn't running, so your apps are offline.");

    r = await status({ state: 'paused', paused: true });
    expect(r).toMatchObject({ code: 1, out: expect.stringContaining('hlabs · Paused · apps stopped') });

    r = await status({ portProblem: { port: 443, heldBy: null, fallbackPort: 8443 } });
    expect(r.code).toBe(1);
    expect(r.out).toContain("! Port 443 is used by another program, so other devices can't reach hlabs");

    r = await status({
      backup: { configured: true, lastSucceededAt: null, running: false, progress: null, lastFailed: true },
      onboardingComplete: false,
      cpuPercent: null,
    });
    expect(r.out).toContain('CPU – ·');
    expect(r.out).toContain('Last backup failed');
    expect(r.out).toContain("Setup isn't finished: run hlabs setup-url");
  });

  it("exits 2 when hlabs can't be reached", async () => {
    await hlabs.start({});
    await hlabs.stop();
    expect(await hlabs.cli(['status'])).toMatchObject({
      code: 2,
      out: "hlabs · Can't reach hlabs",
      err: "Can't reach hlabs. Check that it's running: systemctl status hlabsd",
    });
  });

  it('words times since the last backup', () => {
    expect(ago(NOW - 20_000, NOW)).toBe('just now');
    expect(ago(NOW - 60_000, NOW)).toBe('1 minute ago');
    expect(ago(NOW - 5 * HOUR, NOW)).toBe('5 hours ago');
    expect(ago(NOW - 30 * HOUR, NOW)).toBe('yesterday');
    expect(ago(NOW - 100 * HOUR, NOW)).toBe('4 days ago');
  });
});

describe('US-INST-25 · hlabs logs', () => {
  const pino = (time: number, msg: string, level = 30, extra: object = {}) =>
    `${JSON.stringify({ level, time, v: '1.0.0', msg, ...extra })}\n`;
  const at = (h: number, m: number) => new Date(2026, 10, 21, h, m, 5).getTime();

  it("shows the daemon's log as readable lines, the newest file last", async () => {
    mkdirSync(join(hlabs.dir, 'logs'));
    writeFileSync(join(hlabs.dir, 'logs', 'hlabsd.1.log'), pino(at(9, 0), 'started'));
    writeFileSync(
      join(hlabs.dir, 'logs', 'hlabsd.2.log'),
      pino(at(10, 6), 'listening') +
        pino(at(10, 7), 'could not reach the engine', 50, { err: { message: 'ECONNREFUSED' } }),
    );
    const r = await hlabs.cli(['logs']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n')).toEqual([
      '2026-11-21 09:00:05  INFO   started',
      '2026-11-21 10:06:05  INFO   listening',
      '2026-11-21 10:07:05  ERROR  could not reach the engine: ECONNREFUSED',
    ]);
    expect(formatLine('not json')).toBe('not json');
  });

  it('-f follows new lines, also into a new file when the log rotates', async () => {
    mkdirSync(join(hlabs.dir, 'logs'));
    const first = join(hlabs.dir, 'logs', 'hlabsd.1.log');
    writeFileSync(first, pino(at(9, 0), 'started'));
    const stop = new AbortController();
    let tick = 0;
    const sleep = async () => {
      tick++;
      if (tick === 1) appendFileSync(first, pino(at(9, 1), 'one more'));
      if (tick === 2) {
        appendFileSync(first, pino(at(9, 2), 'last in the old file'));
        writeFileSync(join(hlabs.dir, 'logs', 'hlabsd.2.log'), pino(at(9, 3), 'first in the new file'));
      }
      if (tick === 3) stop.abort();
    };
    const r = await hlabs.cli(['logs', '-f'], { sleep, signal: stop.signal });
    expect(r.out.split('\n').map((l) => l.slice(21))).toEqual([
      'INFO   started',
      'INFO   one more',
      'INFO   last in the old file',
      'INFO   first in the new file',
    ]);
  });

  it("says what to do when the log can't be read, and when there's none yet", async () => {
    expect((await hlabs.cli(['logs'])).out).toBe("hlabs hasn't written any logs yet.");
    if (process.getuid?.() !== 0) {
      mkdirSync(join(hlabs.dir, 'logs'));
      chmodSync(join(hlabs.dir, 'logs'), 0o000);
      expect(await hlabs.cli(['logs'])).toMatchObject({
        code: 77,
        err: 'Run with sudo or add yourself to the hlabs group',
      });
      chmodSync(join(hlabs.dir, 'logs'), 0o750);
    }
  });

  it("--app shows that app's container logs and follows them without repeating lines", async () => {
    const line = (ts: number, text: string) => ({ service: 'server', stream: 'stdout', ts, line: text });
    const answers = [[line(at(10, 0), 'a'), line(at(10, 1), 'b')], [line(at(10, 1), 'b'), line(at(10, 2), 'c')], []];
    await hlabs.start({ 'tray.appLogs': () => ({ lines: answers.shift() ?? [] }) });
    const stop = new AbortController();
    let tick = 0;
    const r = await hlabs.cli(['logs', '--app', 'immich', '-f'], {
      sleep: async () => {
        if (++tick === 3) stop.abort();
      },
      signal: stop.signal,
    });
    expect(r.out.split('\n')).toEqual(['10:00:05  server  a', '10:01:05  server  b', '10:02:05  server  c']);
    expect(hlabs.calls.map((c) => c.input)).toEqual([
      { appId: 'immich', tail: 100 },
      { appId: 'immich', since: at(10, 1) },
      { appId: 'immich', since: at(10, 2) },
    ]);

    await hlabs.start({
      'tray.appLogs': () => {
        throw { hlabsCode: 'NOT_FOUND' };
      },
    });
    expect((await hlabs.cli(['logs', '--app', 'nope'])).err).toBe('There\'s no app called "nope" on this hlabs');
  });
});

describe('US-INST-25 · hlabs reset-password', () => {
  const accounts = {
    users: [
      { id: 'u1', username: 'hari', displayName: 'Hari', role: 'admin', totpEnabled: true },
      { id: 'u2', username: 'asha', displayName: 'Asha', role: 'member', totpEnabled: false },
    ],
  };

  it('asks for the account, the password twice and two-factor, then resets it via the command line', async () => {
    await hlabs.start({ 'tray.listUsers': () => accounts, 'tray.resetPassword': () => ({ ok: true }) });
    const r = await hlabs.cli(['reset-password'], {
      answers: [
        '3',
        '1',
        'short',
        'password1234',
        'violet harbour lantern',
        'violet harbour lanterns',
        'violet harbour lantern',
        'violet harbour lantern',
        'y',
      ],
    });
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      [
        'Which account?',
        '  1. Hari (@hari) · Admin',
        '  2. Asha (@asha) · Member',
        "✓ Reset the password for @hari. They're signed out everywhere and two-factor is off.",
      ].join('\n'),
    );
    expect(r.err.split('\n')).toEqual([
      'Type a number from 1 to 2',
      'Use at least 12 characters',
      'This password is too common',
      "The passwords don't match. Try again.",
    ]);
    expect(r.asked.at(-1)).toBe('Also turn off two-factor? [y/N] ');
    expect(hlabs.calls.at(-1)).toEqual({
      path: 'tray.resetPassword',
      input: { username: 'hari', newPassword: 'violet harbour lantern', disableTotp: true, via: 'cli' },
    });
  });

  it("doesn't ask about two-factor for an account without it", async () => {
    await hlabs.start({ 'tray.listUsers': () => accounts, 'tray.resetPassword': () => ({ ok: true }) });
    const r = await hlabs.cli(['reset-password'], {
      answers: ['2', 'violet harbour lantern', 'violet harbour lantern'],
    });
    expect(r.asked).not.toContain('Also turn off two-factor? [y/N] ');
    expect(hlabs.calls.at(-1)?.input).toMatchObject({ username: 'asha', disableTotp: false });
  });

  it('is root only, even for the hlabs group', async () => {
    await hlabs.start({ 'tray.listUsers': () => accounts });
    expect(await hlabs.cli(['reset-password'], { isRoot: () => false })).toMatchObject({
      code: 77,
      err: 'Run with sudo to reset a password',
    });
    expect(hlabs.calls).toEqual([]);
  });

  it('says when the account went away meanwhile', async () => {
    await hlabs.start({
      'tray.listUsers': () => accounts,
      'tray.resetPassword': () => {
        throw { hlabsCode: 'NOT_FOUND' };
      },
    });
    const r = await hlabs.cli(['reset-password'], {
      answers: ['2', 'violet harbour lantern', 'violet harbour lantern'],
    });
    expect(r).toMatchObject({ code: 1, err: 'This account no longer exists.' });
  });
});
