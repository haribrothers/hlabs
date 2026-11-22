// US-INST-22 on a Linux server (D-144): `hlabs uninstall` is root only and runs the installer's --uninstall with the
// choices given; the installer calls back for what its questions need (--daemon-info) and for the daemon's part
// (--daemon-job: the hlabs_uninstall job, followed until it ends). The questions themselves are install.sh's.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PretendHlabs } from './helpers';

let hlabs: PretendHlabs;
beforeEach(() => {
  hlabs = new PretendHlabs();
});
afterEach(() => hlabs.close());

describe('US-INST-22 · hlabs uninstall', () => {
  it('is root only, and runs the installer with the choices', async () => {
    await hlabs.start({});
    expect(await hlabs.cli(['uninstall'], { isRoot: () => false })).toMatchObject({
      code: 77,
      err: 'Run with sudo to uninstall hlabs',
    });
    const runInstaller = vi.fn(() => 0);
    expect((await hlabs.cli(['uninstall', '--delete-everything', '--yes'], { runInstaller })).code).toBe(0);
    expect(runInstaller).toHaveBeenCalledWith(['--delete-everything', '--yes']);
    expect((await hlabs.cli(['uninstall', '--keep-data', '--delete-everything'])).err).toBe(
      'Choose --keep-data or --delete-everything, not both',
    );
  });

  it('--daemon-info gives the installer the app count, the size and the storage root', async () => {
    await hlabs.start({
      'tray.uninstallInfo': () => ({ appCount: 3, dataBytes: 97e9, storageRoot: '/var/lib/hlabs/storage' }),
    });
    expect((await hlabs.cli(['uninstall', '--daemon-info'])).out).toBe(
      'apps=3\nbytes=97000000000\nstorage=/var/lib/hlabs/storage',
    );
  });

  it('--daemon-job runs the uninstall job from the command line and waits for it', async () => {
    const states = ['running', 'running', 'succeeded'];
    await hlabs.start({
      'tray.uninstall': () => ({ jobId: 'j1' }),
      'tray.job': () => ({ id: 'j1', kind: 'hlabs_uninstall', state: states.shift() }),
    });
    expect((await hlabs.cli(['uninstall', '--daemon-job', '--delete-everything'])).code).toBe(0);
    expect(hlabs.calls[0]).toEqual({
      path: 'tray.uninstall',
      input: { keepData: false, removeColima: false, via: 'cli' },
    });
    expect(hlabs.calls.filter((c) => c.path === 'tray.job')).toHaveLength(3);

    await hlabs.start({
      'tray.uninstall': () => ({ jobId: 'j2' }),
      'tray.job': () => ({ id: 'j2', kind: 'hlabs_uninstall', state: 'failed' }),
    });
    expect(await hlabs.cli(['uninstall', '--daemon-job', '--keep-data'])).toMatchObject({
      code: 1,
      err: "Some apps couldn't be stopped. See: hlabs logs",
    });
  });
});

describe('US-INST-22 · install.sh --uninstall', () => {
  const SCRIPT = resolve(import.meta.dirname, '../../../scripts/install.sh');
  const sh = (code: string) =>
    spawnSync('/bin/sh', ['-c', `. "${SCRIPT}"; LOG=/dev/null; ${code}`], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HLABS_INSTALL_LIB: '1' },
    });

  it('writes sizes as hlabs does', () => {
    expect(sh('size_words 97000000000').stdout).toBe('97 GB');
    expect(sh('size_words 1234000000000').stdout).toBe('1.2 TB');
    expect(sh('size_words 12000000').stdout).toBe('less than 1 GB');
  });

  it('refuses options it does not know', () => {
    const r = sh('uninstall --uninstall --keep-everything');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('✗ Unknown option --keep-everything');
  });
});
