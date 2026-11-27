// D-190 · Backing up and restoring an app's data on Linux: apps keep files to themselves (Postgres's 0700 folder),
// which hlabs's user can't read, and a restore must give them back their owners. restic then runs from a helper
// container as hlabs's user, with only the capabilities it needs; a Home folder, the system part and a copy for
// someone to look at stay as they were. Without an engine restic runs here and the run log says what it couldn't read.
import { backupRuns } from '@hlabs/db';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hostCaFile, ResticCli, type ResticAsRoot } from '../src/backups/restic';
import { HELPER_IMAGE } from '../src/engine/helper-image';
import { backupsDaemon } from './backups-fixture';
import { FakeEngine } from './fakes/engine';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const SUMMARY = JSON.stringify({
  message_type: 'summary',
  snapshot_id: 'abc123',
  data_added: 10,
  total_bytes_processed: 20,
});

function cli(engine: FakeEngine | null, overrides: Partial<ResticAsRoot> = {}) {
  const dir = tempDir('d190-');
  const root: ResticAsRoot = {
    engine: () => engine,
    image: HELPER_IMAGE,
    uid: 999,
    gid: 998,
    caFile: '/etc/ssl/certs/ca-certificates.crt',
    ...overrides,
  };
  return { restic: new ResticCli('/opt/hlabs/bin/restic', join(dir, 'cache'), root), cache: join(dir, 'cache'), dir };
}

const repo = (url: string) => ({ url, env: { RESTIC_PASSWORD: 'secret' } });

describe('D-190 · restic for an app’s data on Linux', () => {
  it('backs up from the helper as hlabs’s user, reading any file; the repository stays hlabs’s', async () => {
    const engine = new FakeEngine();
    engine.helperResult = () => ({
      exitCode: 0,
      stdout: `${JSON.stringify({ message_type: 'status', percent_done: 0.5 })}\n${SUMMARY}\n`,
      stderr: '',
    });
    const { restic, cache } = cli(engine);
    const progress: number[] = [];
    const res = await restic.backup(
      repo('/mnt/nas/hlabs-backups'),
      { paths: ['/data/apps/paperless'], tags: ['app:paperless'], asRoot: true },
      (p) => progress.push(p.fraction),
    );
    expect(res).toMatchObject({ snapshotId: 'abc123', bytesAdded: 10, unreadable: 0 });
    expect(progress).toEqual([0.5]);
    const [run] = engine.helpers;
    expect(run).toMatchObject({
      image: HELPER_IMAGE,
      user: '0:0',
      entrypoint: ['setpriv'],
      capAdd: ['DAC_READ_SEARCH'],
      network: 'none',
    });
    expect(run!.cmd.slice(0, 6)).toEqual([
      '--reuid=999',
      '--regid=998',
      '--clear-groups',
      '--inh-caps=+dac_read_search',
      '--ambient-caps=+dac_read_search',
      '/hlabs/restic',
    ]);
    expect(run!.cmd.slice(6, 9)).toEqual(['backup', '--json', '--host']);
    expect(run!.cmd.at(-1)).toBe('/data/apps/paperless');
    // The same paths inside, so snapshots match whichever way restic ran; the data read-only.
    expect(run!.binds).toEqual([
      '/opt/hlabs/bin/restic:/hlabs/restic:ro',
      `${cache}:${cache}`,
      '/etc/ssl/certs/ca-certificates.crt:/hlabs/ca.crt:ro',
      '/mnt/nas/hlabs-backups:/mnt/nas/hlabs-backups',
      '/data/apps/paperless:/data/apps/paperless:ro',
    ]);
    // The password only in the environment (07 §7.7), never the command line.
    expect(run!.env).toMatchObject({
      RESTIC_PASSWORD: 'secret',
      RESTIC_REPOSITORY: '/mnt/nas/hlabs-backups',
      RESTIC_CACHE_DIR: cache,
      SSL_CERT_FILE: '/hlabs/ca.crt',
    });
    expect(run!.cmd.join(' ')).not.toContain('secret');
  });

  it('a cloud destination goes over the network, with nothing of the repository mounted', async () => {
    const engine = new FakeEngine();
    engine.helperResult = () => ({ exitCode: 0, stdout: SUMMARY, stderr: '' });
    const { restic } = cli(engine);
    await restic.backup(repo('s3:https://s3.example.com/bucket/hlabs-backups'), {
      paths: ['/data/apps/immich'],
      tags: [],
      asRoot: true,
    });
    expect(engine.helpers[0]!.network).toBe('bridge');
    expect(engine.helpers[0]!.binds.some((b) => b.startsWith('s3:'))).toBe(false);
  });

  it('restores with each file’s owner put back: chown and the rest, into the staging folder only', async () => {
    const engine = new FakeEngine();
    const { restic } = cli(engine);
    await restic.restore(repo('/mnt/nas/hlabs-backups'), {
      snapshotId: 'abc123',
      path: '/data/apps/paperless',
      target: '/data/apps/.restore/r1/staging/app_paperless',
      asRoot: true,
    });
    const [run] = engine.helpers;
    expect(run!.cmd).toContain('--ambient-caps=+chown,+fowner,+dac_override,+fsetid');
    expect(run!.capAdd).toEqual([]);
    expect(run!.binds.at(-1)).toBe(
      '/data/apps/.restore/r1/staging/app_paperless:/data/apps/.restore/r1/staging/app_paperless',
    );
    expect(run!.cmd.slice(6)).toEqual([
      'restore',
      '--json',
      'abc123:/data/apps/paperless',
      '--target',
      '/data/apps/.restore/r1/staging/app_paperless',
    ]);
  });

  it('counts what restic couldn’t read, and a failure is the backup error it always was', async () => {
    const engine = new FakeEngine();
    const err = JSON.stringify({ message_type: 'error', error: { message: 'permission denied' } });
    engine.helperResult = () => ({ exitCode: 3, stdout: `${err}\n${err}\n${SUMMARY}`, stderr: '' });
    const { restic } = cli(engine);
    const res = await restic.backup(repo('/mnt/nas/r'), { paths: ['/data/apps/x'], tags: [], asRoot: true });
    expect(res.unreadable).toBe(2);
    engine.helperResult = () => ({ exitCode: 12, stdout: '', stderr: 'Fatal: wrong password or no key found\n' });
    await expect(
      restic.backup(repo('/mnt/nas/r'), { paths: ['/data/apps/x'], tags: [], asRoot: true }),
    ).rejects.toMatchObject({ cause: { hlabsCode: 'BACKUP_REPO_PASSWORD_WRONG' } });
  });

  it('without an engine, or for anything that isn’t an app’s data, restic runs here as before', async () => {
    // A stand-in restic: prints a summary and an unreadable file, and exits 3 as restic does then.
    const { dir } = cli(null);
    const bin = join(dir, 'restic');
    const err = JSON.stringify({ message_type: 'error', error: { message: 'open /data/x/pg: permission denied' } });
    writeFileSync(bin, `#!/bin/sh\necho '${err}'\necho '${SUMMARY}'\nexit 3\n`);
    chmodSync(bin, 0o755);
    const engine = new FakeEngine();
    for (const e of [null, engine]) {
      const restic = new ResticCli(bin, join(dir, 'cache'), {
        engine: () => e,
        image: HELPER_IMAGE,
        uid: 999,
        gid: 998,
        caFile: null,
      });
      const res = await restic.backup(repo(join(dir, 'repo')), { paths: [dir], tags: [], asRoot: e === null });
      expect(res).toMatchObject({ snapshotId: 'abc123', unreadable: 1 });
    }
    expect(engine.helpers).toEqual([]);
  });

  it('finds the CA bundle where Linux keeps it, or none', () => {
    expect(hostCaFile((p) => p === '/etc/pki/tls/certs/ca-bundle.crt')).toBe('/etc/pki/tls/certs/ca-bundle.crt');
    expect(hostCaFile(() => false)).toBeNull();
  });
});

describe('D-190 · which backups and restores ask for it', () => {
  it('a run backs up each app’s data as root, Home folders and the system part as hlabs; unread files are logged', async () => {
    const t = await backupsDaemon(closers);
    const { data } = t.app('vaultwarden', { name: 'Vaultwarden' });
    t.put('users/hari/Documents/tax.pdf');
    await t.nasDestination();
    t.restic.unreadable = 0;
    await t.backUp();
    expect(t.restic.asRoot).toEqual([{ op: 'backup', path: data }]);

    t.restic.unreadable = 3;
    await t.backUp();
    const log = readFileSync(t.db.select().from(backupRuns).all().at(-1)!.logPath!, 'utf8');
    expect(log).toMatch(/Couldn't read 3 of vaultwarden's files; this backup doesn't have them/i);
  });

  it('replacing an app’s data restores it as root; a copy into Home stays hlabs’s', async () => {
    const t = await backupsDaemon(closers);
    const { data } = t.app('vaultwarden', { name: 'Vaultwarden' });
    const nas = await t.nasDestination();
    const point = await t.backUp();
    for (const mode of ['copy', 'replace'] as const) {
      const reply = await t.d.mutate('backups.restore', {
        destinationId: nas.destinationId,
        snapshotId: point,
        scope: { mode, apps: ['vaultwarden'], folders: [] },
        // The admin's own password, which replacing data asks for again.
        password: 'correct horse battery',
      });
      if (!(reply as { result?: unknown }).result) throw new Error(JSON.stringify(reply));
      const { jobId } = t.data<{ jobId: string }>(reply);
      expect((await t.s.jobs.settled(jobId))?.state).toBe('succeeded');
    }
    expect(t.restic.asRoot.filter((c) => c.op === 'restore')).toEqual([{ op: 'restore', path: data }]);
  });
});
