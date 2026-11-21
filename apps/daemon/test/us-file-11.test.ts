// US-FILE-11 · Connect an SMB or NFS drive (server side): servers found on the network with their shares, a host's
// shares, testing and connecting (password in the secret store, never SQLite), "<Host> · <Share>", the two switches,
// the 10 s limit, mounting again at start and every minute, and admins only.
import { hlabsError } from '@hlabs/api';
import { auditLog, storageLocations } from '@hlabs/db';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { NetworkDiscovery } from '../src/platform/network-discovery';
import {
  parseAvahi,
  parseDnsSdBrowse,
  parseDnsSdResolve,
  parseShowmount,
  parseSmbShares,
  LinuxDiscovery,
  MacDiscovery,
  smbLoginResult,
} from '../src/platform/network-discovery';
import { CONNECT_TIMEOUT_MS } from '../src/storage/network';
import { FakeMounter } from './fakes/mounter';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const discovery: NetworkDiscovery = {
  browse: async () => [{ name: 'NAS', host: 'nas.local', protocol: 'smb', shares: ['Media', 'Photos', 'Backups'] }],
  shares: async (_p, host, login) => {
    // hlab.local lists its shares only to a signed-in user, as many NAS boxes do.
    if (host === 'hlab.local') {
      if (!login) return null;
      if (login.password !== 'right') throw hlabsError('NAS_AUTH_FAILED');
      return ['Family', 'Scans'];
    }
    return host === 'nas.local' ? ['Media', 'Photos', 'Backups'] : null;
  },
};

async function setup() {
  const mounter = new FakeMounter();
  const f = await filesDaemon(closers, { boot: { mounter, discovery, watchDrives: false } });
  return { ...f, mounter };
}

const nas = { protocol: 'smb', host: 'nas.local', share: 'Media', username: 'hari', password: 'secret-pass' };

describe('US-FILE-11', () => {
  it("lists servers found on the network with their shares, and a host's shares", async () => {
    const f = await setup();
    expect(f.data(await f.d.query('storage.locations.discover'))).toEqual({
      servers: [{ name: 'NAS', host: 'nas.local', protocol: 'smb', shares: ['Media', 'Photos', 'Backups'] }],
    });
    expect(f.data(await f.d.mutate('storage.locations.testNetwork', { protocol: 'smb', host: 'nas.local' }))).toEqual({
      ok: true,
      shares: ['Media', 'Photos', 'Backups'],
    });
    expect(f.data(await f.d.mutate('storage.locations.testNetwork', { protocol: 'smb', host: 'other.local' }))).toEqual(
      {
        ok: true,
        shares: null,
      },
    );
  });

  it('connects: tests and mounts, keeps the password in the secret store, and adds "<Host> · <Share>"', async () => {
    const f = await setup();
    expect(f.data(await f.d.mutate('storage.locations.testNetwork', nas))).toEqual({ ok: true });
    const added = f.data<{ locationId: string }>(
      await f.d.mutate('storage.locations.addNetwork', {
        ...nas,
        name: 'NAS · Media',
        appsAllowed: false,
        autoMount: true,
      }),
    );
    const row = f.db.select().from(storageLocations).where(eq(storageLocations.id, added.locationId)).get()!;
    expect(row).toMatchObject({ kind: 'smb', name: 'NAS · Media', status: 'ok', autoMount: true, appsAllowed: false });
    expect(JSON.stringify(row)).not.toContain('secret-pass');
    expect(await f.d.services!.secrets.get(row.secretRef!)).toBe('secret-pass');
    expect(f.db.select().from(auditLog).where(eq(auditLog.action, 'storage.addNetwork')).all()).toHaveLength(1);
    const list = f.data<{ locations: Array<{ name: string; usedBy: string[]; autoMount: boolean }> }>(
      await f.d.query('storage.locations.list'),
    ).locations;
    expect(list.find((l) => l.name === 'NAS · Media')).toMatchObject({
      usedBy: [],
      autoMount: true,
      appsAllowed: false,
    });
    // In Files at once.
    expect(
      f.data<{ place: { name: string } }>(await f.d.query('files.list', { path: `/drives/${added.locationId}` })).place
        .name,
    ).toBe('NAS · Media');
  });

  it("a failed test says why: wrong password, can't reach, no such share", async () => {
    const f = await setup();
    f.mounter.fail = 'NAS_AUTH_FAILED';
    expect(f.code(await f.d.mutate('storage.locations.testNetwork', nas))).toBe('NAS_AUTH_FAILED');
    f.mounter.fail = 'NAS_UNREACHABLE';
    expect(f.code(await f.d.mutate('storage.locations.addNetwork', nas))).toBe('NAS_UNREACHABLE');
    expect(f.db.select().from(storageLocations).all()).toHaveLength(1);
  });

  it('gives up after 10 s', async () => {
    const f = await setup();
    f.mounter.mount = () => new Promise(() => {});
    expect(CONNECT_TIMEOUT_MS).toBe(10_000);
    const { NetworkStorage } = await import('../src/storage/network');
    const s = f.d.services!;
    const quick = new NetworkStorage({ db: s.db, secrets: s.secrets, mounter: f.mounter, mountsDir: f.root });
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      const testing = quick.test(nas as never);
      const caught = testing.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await caught).toMatchObject({ cause: { hlabsCode: 'NAS_UNREACHABLE' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('mounts again at start and every minute while unreachable, when set to; otherwise waits for Try again', async () => {
    const f = await setup();
    const auto = f.data<{ locationId: string }>(
      await f.d.mutate('storage.locations.addNetwork', { ...nas, autoMount: true }),
    );
    const manual = f.data<{ locationId: string }>(
      await f.d.mutate('storage.locations.addNetwork', { ...nas, share: 'Photos', autoMount: false }),
    );
    const status = (id: string) =>
      f.db.select().from(storageLocations).where(eq(storageLocations.id, id)).get()!.status;
    // A restart: nothing is mounted any more, and the NAS is away.
    f.mounter.mounted.clear();
    f.mounter.fail = 'NAS_UNREACHABLE';
    await f.d.services!.networkDrives.check();
    expect([status(auto.locationId), status(manual.locationId)]).toEqual(['unreachable', 'unreachable']);
    // The NAS is back: the next check mounts only the automatic one.
    f.mounter.fail = null;
    await f.d.services!.networkDrives.check();
    expect([status(auto.locationId), status(manual.locationId)]).toEqual(['ok', 'unreachable']);
  });

  it("members can't look for, test or connect drives", async () => {
    const f = await setup();
    expect(f.code(await f.anu.query('storage.locations.discover'))).toBe('ACCESS_DENIED');
    expect(f.code(await f.anu.mutate('storage.locations.addNetwork', nas))).toBe('ACCESS_DENIED');
    expect(f.code(await f.anu.mutate('storage.locations.testNetwork', nas))).toBe('ACCESS_DENIED');
  });

  it('reads what the system tools print', () => {
    expect(
      parseDnsSdBrowse(
        [
          'Timestamp     A/R    Flags  if Domain               Service Type         Instance Name',
          '17:24:40.998  Add        3  15 local.               _smb._tcp.           Hari Home',
          '17:24:40.998  Add        2  15 local.               _smb._tcp.           NAS',
          '17:24:41.000  Rmv        0  15 local.               _smb._tcp.           Old',
        ].join('\n'),
      ),
    ).toEqual(['Hari Home', 'NAS']);
    expect(
      parseDnsSdResolve('17:24:49.744  NAS._smb._tcp.local. can be reached at nas.local.:445 (interface 15)'),
    ).toBe('nas.local');
    expect(
      parseAvahi(
        '=;eth0;IPv4;My\\032NAS;_smb._tcp;local;nas.local;192.168.1.5;445;\n+;eth0;IPv4;x;_smb._tcp;local',
        '_smb._tcp',
      ),
    ).toEqual([{ name: 'My NAS', host: 'nas.local' }]);
    expect(
      parseSmbShares(
        'Share        Type    Comments\n-----\nMedia        Disk    \nIPC$         Pipe\nadmin$       Disk\nPhotos Shared   Disk  family\n',
      ),
    ).toEqual(['Media', 'Photos Shared']);
    expect(
      parseShowmount('Exports list on nas.local:\n/volume1/media    192.168.1.0/24\n/volume1/photos   *\n'),
    ).toEqual(['/volume1/media', '/volume1/photos']);
  });

  it('a server that hides its shares lists them once signed in; a wrong password says so', async () => {
    const f = await setup();
    const list = (login: Record<string, string> = {}) =>
      f.d.mutate('storage.locations.testNetwork', { protocol: 'smb', host: 'hlab.local', ...login });
    expect(f.data(await list())).toEqual({ ok: true, shares: null });
    expect(f.data(await list({ username: 'hari', password: 'right' }))).toEqual({
      ok: true,
      shares: ['Family', 'Scans'],
    });
    expect(f.code(await list({ username: 'hari', password: 'wrong' }))).toBe('NAS_AUTH_FAILED');
  });

  it('macOS answers smbutil’s prompt with expect; the password is only ever in its environment', async () => {
    const calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const mac = new MacDiscovery(async (command, args, opts) => {
      calls.push({ command, args, env: opts?.env });
      return { code: 0, stdout: 'Share   Type   Comments\n-----\nFamily     Disk\nIPC$     Pipe\n', stderr: '' };
    });
    expect(await mac.shares('smb', 'hlab.local', { username: 'hari', password: 's3cret' })).toEqual(['Family']);
    expect(calls[0]!.command).toBe('/usr/bin/expect');
    expect(calls[0]!.args.join(' ')).not.toContain('s3cret');
    expect(calls[0]!.env).toMatchObject({
      HLABS_SMB_HOST: 'hlab.local',
      HLABS_SMB_USER: 'hari',
      HLABS_SMB_PASSWORD: 's3cret',
    });
  });

  it('Linux gives smbclient a credentials file and removes it', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'smb-'));
    let file = '';
    const linux = new LinuxDiscovery(tmp, async (_command, args) => {
      file = args[args.indexOf('-A') + 1]!;
      expect(existsSync(file)).toBe(true);
      expect(args.join(' ')).not.toContain('s3cret');
      return { code: 0, stdout: 'Disk|Family|\nIPC|IPC$|\n', stderr: '' };
    });
    expect(await linux.shares('smb', 'hlab.local', { username: 'hari', password: 's3cret' })).toEqual(['Family']);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('reads smbutil’s answer as a user: shares, a refused login, or no answer', () => {
    expect(smbLoginResult(0, 'Family    Disk\nScans   Disk\n')).toEqual(['Family', 'Scans']);
    expect(() => smbLoginResult(77, 'smbutil: server rejected the authentication: Authentication error')).toThrow(
      'NAS_AUTH_FAILED',
    );
    expect(() => smbLoginResult(68, 'smbutil: Unable to connect')).toThrow('unreachable');
  });
});
