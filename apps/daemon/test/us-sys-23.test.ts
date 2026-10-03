// US-SYS-23 · Update hlabs (server side): "Update now" starts the exclusive system_update job. On a Mac or Linux
// desktop the daemon asks the menu-bar app (update.applyRequested) and the job settles on the next start; on a
// headless Linux server the daemon downloads, checks (SHA-256 and signature) and installs beside the running version,
// switches `current` and restarts, and the start check switches back if the new version never gets ready.
import { hlabsCodeOf, type HlabsEvent } from '@hlabs/api';
import { auditLog, jobs as jobsTable, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  applyHeadless,
  currentVersion,
  headlessPlatform,
  pointCurrent,
  readMarker,
  SWITCH_BACK_AFTER_MS,
  switchBackIfStale,
} from '../src/updates/headless';
import { UPDATE_PUBLIC_KEY } from '../src/updates/key';
import { verifySignature } from '../src/updates/signature';
import { daemonWithAdmin } from './admin-session';
import { FakeHeadlessHost } from './fakes/headless-host';
import { testSigner } from './fakes/minisign';
import { FakeUpdateSource } from './fakes/update-source';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const waitFor = async (check: () => boolean, ms = 3000) => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** An install root with 1.4.0 running. */
function installRoot() {
  const root = tempDir('opt-hlabs-');
  mkdirSync(join(root, '1.4.0'));
  pointCurrent(root, '1.4.0');
  return root;
}

/** A signed "tarball" and its manifest entry. */
function release(signer = testSigner(), data = Buffer.from('tarball bytes')) {
  const dir = tempDir('dl-');
  const file = join(dir, 'hlabsd.tar.gz');
  writeFileSync(file, data);
  const url = 'https://example.test/hlabsd-1.5.0.tar.gz';
  return {
    signer,
    file,
    url,
    download: { url, signature: signer.sign(data), sha256: createHash('sha256').update(data).digest('hex') },
  };
}

describe('US-SYS-23 · Update hlabs', () => {
  describe('signatures', () => {
    it('accepts a file signed by `tauri signer` with the hlabs key, and nothing else', () => {
      const data = readFileSync(join(import.meta.dirname, 'fixtures/update/payload.txt'));
      const sig = readFileSync(join(import.meta.dirname, 'fixtures/update/payload.txt.sig'), 'utf8');
      expect(verifySignature(data, sig, UPDATE_PUBLIC_KEY)).toBe(true);
      expect(verifySignature(Buffer.concat([data, Buffer.from('!')]), sig, UPDATE_PUBLIC_KEY)).toBe(false);
      expect(verifySignature(data, sig, testSigner().publicKey)).toBe(false);
      expect(verifySignature(data, 'not a signature', UPDATE_PUBLIC_KEY)).toBe(false);
    });
  });

  describe('on a Mac or Linux desktop', () => {
    async function setup(trayTakeoverMs = 60_000) {
      const source = new FakeUpdateSource();
      source.releases.stable = { version: '1.5.0' };
      const first = await daemonWithAdmin(closers, { version: '1.4.0' }, { updateSource: source, trayTakeoverMs });
      const events: HlabsEvent[] = [];
      first.services!.bus.on((e) => events.push(e.event));
      return { d: first, source, events };
    }

    it('"Update now" without a newer version is refused', async () => {
      const { d } = await setup();
      expect((await d.mutate('settings.updates.install')).error?.data.hlabsCode).toBe('UPDATE_NOT_AVAILABLE');
    });

    it('starts the system_update job and asks the menu-bar app to apply it', async () => {
      const { d, events } = await setup();
      await d.mutate('settings.updates.check');
      const { jobId } = (await d.mutate('settings.updates.install')).result!.data as { jobId: string };
      await waitFor(() => events.some((e) => e.type === 'update.applyRequested'));
      expect(events.find((e) => e.type === 'update.applyRequested')?.data).toEqual({ jobId, version: '1.5.0' });
      const s = d.services!;
      expect(s.db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get()?.kind).toBe('system_update');
      const audit = s.db.select().from(auditLog).where(eq(auditLog.action, 'system.update_started')).get();
      expect(audit?.detailJson).toEqual({ from: '1.4.0', to: '1.5.0' });
    });

    it('while it runs, a second update waits for it (and the status says what for)', async () => {
      const { d } = await setup();
      await d.mutate('settings.updates.check');
      await d.mutate('settings.updates.install');
      expect((await d.mutate('settings.updates.install')).error?.data.hlabsCode).toBe('JOB_EXCLUSIVE_RUNNING');
      const status = (await d.query('settings.updates.get')).result!.data as { blockedBy: string | null };
      expect(status.blockedBy).toBe('system_update');
    });

    it('another exclusive job blocks "Update now"', async () => {
      const { d } = await setup();
      d.services!.db.insert(jobsTable)
        .values({ id: ulid(), kind: 'restore', state: 'running', createdAt: Date.now() })
        .run();
      await d.mutate('settings.updates.check');
      expect(((await d.query('settings.updates.get')).result!.data as { blockedBy: string }).blockedBy).toBe('restore');
      expect((await d.mutate('settings.updates.install')).error?.data.hlabsCode).toBe('JOB_EXCLUSIVE_RUNNING');
    });

    it('fails with UPDATE_NOT_APPLIED when the menu-bar app never takes over', async () => {
      const { d } = await setup(50);
      await d.mutate('settings.updates.check');
      const { jobId } = (await d.mutate('settings.updates.install')).result!.data as { jobId: string };
      const job = () => d.services!.db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get();
      await waitFor(() => job()?.state === 'failed');
      expect(job()?.errorCode).toBe('UPDATE_NOT_APPLIED');
    });

    it('the tray stops the daemon: the job stays, and the next start on the new version settles it', async () => {
      const { d } = await setup();
      await d.mutate('settings.updates.check');
      const { jobId } = (await d.mutate('settings.updates.install')).result!.data as { jobId: string };
      await d.close();
      closers.splice(closers.indexOf(d.close), 1);
      const row = (db: HlabsDb) => db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get();
      const next = await daemonWithAdmin(
        closers,
        { version: '1.5.0', paths: d.config.paths },
        { updateSource: new FakeUpdateSource() },
      );
      expect(row(next.services!.db)?.state).toBe('succeeded');
      const finished = next
        .services!.db.select()
        .from(auditLog)
        .where(eq(auditLog.action, 'system.update_finished'))
        .get();
      expect(finished?.detailJson).toEqual({ from: '1.4.0', to: '1.5.0' });
    });
  });

  describe('on a headless Linux server', () => {
    it('downloads, checks, installs beside the running version and switches `current`', async () => {
      const root = installRoot();
      const r = release();
      const host = new FakeHeadlessHost();
      host.files.set(r.url, r.file);
      await applyHeadless({
        root,
        version: '1.5.0',
        download: r.download,
        publicKey: r.signer.publicKey,
        host,
        signal: new AbortController().signal,
        report: () => {},
        now: () => 1000,
      });
      expect(currentVersion(root)).toBe('1.5.0');
      expect(readlinkSync(join(root, 'current'))).toBe('1.5.0');
      expect(readFileSync(join(root, '1.5.0', 'hlabsd'), 'utf8')).toBe('new version');
      expect(existsSync(join(root, '1.4.0'))).toBe(true);
      expect(readMarker(root)).toEqual({ from: '1.4.0', to: '1.5.0', at: 1000 });
    });

    it('a bad signature or checksum: UPDATE_SIGNATURE_INVALID and nothing is installed', async () => {
      for (const tamper of ['signature', 'checksum'] as const) {
        const root = installRoot();
        const r = release();
        const download =
          tamper === 'signature'
            ? { ...r.download, signature: testSigner().sign(Buffer.from('tarball bytes')) }
            : { ...r.download, sha256: '0'.repeat(64) };
        const host = new FakeHeadlessHost();
        host.files.set(r.url, r.file);
        await expect(
          applyHeadless({
            root,
            version: '1.5.0',
            download,
            publicKey: r.signer.publicKey,
            host,
            signal: new AbortController().signal,
            report: () => {},
          }),
        ).rejects.toSatisfy((err) => hlabsCodeOf(err) === 'UPDATE_SIGNATURE_INVALID');
        expect(currentVersion(root)).toBe('1.4.0');
        expect(existsSync(join(root, '1.5.0'))).toBe(false);
        expect(readMarker(root)).toBeNull();
      }
    });

    it('the start check switches back when the new version never got ready within 3 minutes', async () => {
      const root = installRoot();
      mkdirSync(join(root, '1.5.0'));
      pointCurrent(root, '1.5.0');
      writeFileSync(join(root, 'switch.json'), JSON.stringify({ from: '1.4.0', to: '1.5.0', at: 0 }));
      expect(switchBackIfStale(root, SWITCH_BACK_AFTER_MS - 1)).toBe('waiting');
      expect(currentVersion(root)).toBe('1.5.0');
      expect(switchBackIfStale(root, SWITCH_BACK_AFTER_MS)).toBe('switched-back');
      expect(currentVersion(root)).toBe('1.4.0');
      expect(readMarker(root)).toBeNull();
      expect(switchBackIfStale(root)).toBe('none');
    });

    it('"Update now" applies it, tells every page it is updating and restarts; the new version keeps its switch', async () => {
      const root = installRoot();
      const r = release();
      const host = new FakeHeadlessHost();
      host.files.set(r.url, r.file);
      const source = new FakeUpdateSource();
      source.releases.stable = { version: '1.5.0', platforms: { [headlessPlatform()]: r.download } };
      const d = await daemonWithAdmin(
        closers,
        { version: '1.4.0', headless: true, installRoot: root },
        { updateSource: source, headlessHost: host },
      );
      // The test signer stands in for the hlabs key.
      d.services!.systemUpdate.headless.publicKey = r.signer.publicKey;
      const events: HlabsEvent[] = [];
      d.services!.bus.on((e) => events.push(e.event));
      await d.mutate('settings.updates.check');
      expect((await d.mutate('settings.updates.install')).result).toBeDefined();
      await waitFor(() => host.restarts === 1);
      expect(events).toContainEqual(expect.objectContaining({ type: 'system.status', data: { state: 'updating' } }));
      expect(currentVersion(root)).toBe('1.5.0');
      // systemd stops 1.4.0 and starts 1.5.0, which gets ready: the switch is confirmed and the job settled.
      await d.close();
      closers.splice(closers.indexOf(d.close), 1);
      const next = await daemonWithAdmin(
        closers,
        { version: '1.5.0', headless: true, installRoot: root, paths: d.config.paths },
        { updateSource: source, headlessHost: host },
      );
      expect(readMarker(root)).toBeNull();
      const job = next.services!.db.select().from(jobsTable).where(eq(jobsTable.kind, 'system_update')).get();
      expect(job?.state).toBe('succeeded');
    });
  });
});
