// US-SYS-28 · Download a diagnostics bundle (server side): system.diagnostics builds a zip as a job, with system and
// engine info, the apps with their states and versions, the daemon's, Caddy's and installs' logs of 7 days, the jobs and
// each app's container logs of 24 hours. Known secrets fed through every collector never appear in it; usernames are
// user1, user2…; no database, keychain item or person's file is in it. Only the admin who asked downloads it, as
// hlabs-diagnostics-<hostname>-<date>.zip, within 15 minutes. Audited.
import { appEnv, auditLog, backupDestinations } from '@hlabs/db';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { bundleName, DOWNLOAD_FOR_MS } from '../src/system/diagnostics';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';
import type { Reply } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** The files of a zip (stored or deflated), read from its central directory. */
function unzip(buf: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    p += 46 + nameLen + extra + comment;
  }
  return files;
}

const SECRETS = {
  envSecret: 'Zq8-generated-app-secret-value-41',
  envPlain: 'postgres-password-in-env',
  bearer: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
  password: 'correct horse battery staple',
  session: 'raw-session-cookie-value',
  repo: 'repo-encryption-passphrase-77',
  email: 'hari@example.com',
  publicIp: '203.0.113.9',
};

async function setup() {
  const t = await installDaemon(closers);
  t.s.appWatch.stop();
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const { dataDir } = t.d.config.paths;
  // A secret env key and the app's .env.
  t.s.db
    .insert(appEnv)
    .values({ appId: 'uptime-kuma', key: 'API_SECRET', value: null, secretRef: 'env', isSecret: true })
    .run();
  appendFileSync(
    join(dataDir, 'apps', 'uptime-kuma', '.env'),
    `API_SECRET=${SECRETS.envSecret}\nDB_PASS=${SECRETS.envPlain}\nPUID=1000\n`,
  );
  // A backup destination's password in the secret store.
  t.s.db
    .insert(backupDestinations)
    .values({
      id: 'dest1',
      kind: 'local',
      name: 'Disk',
      configJson: {},
      repoPasswordRef: 'backup:dest1:password',
      createdAt: 1,
    })
    .run();
  await t.s.secrets.set('backup:dest1:password', SECRETS.repo);
  // Secrets in every log: the daemon's, Caddy's, installs', the jobs and the containers.
  const now = Date.now();
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  const leaky = [
    `Authorization: Bearer ${SECRETS.bearer}`,
    `{"password":"${SECRETS.password}"}`,
    `cookie hlabs_session=${SECRETS.session}`,
    `env ${SECRETS.envSecret} and ${SECRETS.envPlain}`,
    `repo ${SECRETS.repo}`,
    `mail ${SECRETS.email} from ${SECRETS.publicIp} via 192.168.1.20`,
    'user hari signed in',
  ];
  writeFileSync(
    join(dataDir, 'logs', 'hlabsd.1.log'),
    [
      ...leaky.map((msg, i) => JSON.stringify({ level: 30, time: now - 1000 + i, msg })),
      JSON.stringify({ level: 30, time: now - 8 * 24 * 3600_000, msg: 'too old for the bundle' }),
    ]
      .sort()
      .join('\n'),
  );
  mkdirSync(join(dataDir, 'caddy'), { recursive: true });
  writeFileSync(
    join(dataDir, 'caddy', 'caddy.log'),
    leaky.map((msg, i) => JSON.stringify({ level: 'info', ts: (now - 900 + i) / 1000, msg })).join('\n'),
  );
  writeFileSync(
    join(dataDir, 'logs', 'installs.log'),
    leaky.map((msg, i) => JSON.stringify({ level: 30, time: now - 800 + i, msg })).join('\n'),
  );
  const [container] = await t.engine.projectContainers('hlabs-uptime-kuma');
  for (const line of leaky) t.engine.addLog(container!.id, { stream: 'stdout', ts: now - 500, line });
  t.engine.addLog(container!.id, { stream: 'stdout', ts: now - 2 * 24 * 3600_000, line: 'two days ago' });
  return t;
}

async function build(t: Awaited<ReturnType<typeof setup>>) {
  const res = (await t.d.mutate('system.diagnostics')) as Reply;
  expect(res.error).toBeUndefined();
  const jobId = res.result!.data.jobId as string;
  const job = await t.s.jobs.settled(jobId);
  expect(job).toMatchObject({ kind: 'diagnostics', state: 'succeeded' });
  return jobId;
}

describe('US-SYS-28', () => {
  it('builds a bundle with what was asked for and none of the secrets fed to every collector', async () => {
    const t = await setup();
    const jobId = await build(t);
    const res = await fetch(`${t.d.url}/api/diagnostics/${jobId}`, { headers: { cookie: t.d.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${bundleName('hlabs')}"`);
    expect(bundleName('hlabs', new Date(2026, 10, 3))).toBe('hlabs-diagnostics-hlabs-2026-11-03.zip');
    const files = unzip(Buffer.from(await res.arrayBuffer()));
    expect([...files.keys()].sort()).toEqual([
      'apps.json',
      'containers/uptime-kuma.log',
      'engine.txt',
      'logs/caddy.log',
      'logs/hlabsd.log',
      'logs/installs.log',
      'logs/jobs.json',
      'system.txt',
    ]);
    expect(JSON.parse(files.get('apps.json')!)).toEqual([
      expect.objectContaining({ id: 'uptime-kuma', state: 'running', version: expect.any(String) }),
    ]);
    expect(files.get('engine.txt')).toContain('Engine: orbstack');
    expect(files.get('logs/jobs.json')).toContain('app_install');
    expect(files.get('logs/hlabsd.log')).not.toContain('too old for the bundle');
    expect(files.get('containers/uptime-kuma.log')).not.toContain('two days ago');

    const all = [...files.values()].join('\n');
    for (const [what, secret] of Object.entries(SECRETS)) expect(all, what).not.toContain(secret);
    // Each collector redacted its own copy.
    for (const name of ['logs/hlabsd.log', 'logs/caddy.log', 'logs/installs.log', 'containers/uptime-kuma.log']) {
      expect(files.get(name), name).toContain('[redacted]');
      expect(files.get(name), name).toContain('user1 signed in');
      expect(files.get(name), name).toContain('192.168.1.20');
    }
    // No database, secret store or person's file.
    expect(all).not.toContain('SQLite format');
    expect(all).not.toContain(readFileSync(join(t.d.config.paths.dataDir, 'secret.key')).toString('base64'));

    expect(
      t.s.db
        .select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'system.diagnostics'),
    ).toMatchObject({
      userId: t.d.userId,
      target: jobId,
    });
  });

  it('only the admin who asked can download it, for 15 minutes', async () => {
    const t = await setup();
    const jobId = await build(t);
    const anu = await memberSession(t.d);
    expect((await anu.mutate('system.diagnostics')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect((await fetch(`${t.d.url}/api/diagnostics/${jobId}`, { headers: { cookie: anu.cookie } })).status).toBe(403);
    expect((await fetch(`${t.d.url}/api/diagnostics/${jobId}`)).status).toBe(401);
    const other = await memberSession(t.d, { username: 'priya', role: 'admin' });
    expect((await fetch(`${t.d.url}/api/diagnostics/${jobId}`, { headers: { cookie: other.cookie } })).status).toBe(
      404,
    );
    expect((await fetch(`${t.d.url}/api/diagnostics/NOTAJOB`, { headers: { cookie: t.d.cookie } })).status).toBe(404);

    const later = Date.now() + DOWNLOAD_FOR_MS + 1_000;
    const diag = t.s.advanced.diagnostics as unknown as { deps: { now?: () => number } };
    diag.deps.now = () => later;
    expect((await fetch(`${t.d.url}/api/diagnostics/${jobId}`, { headers: { cookie: t.d.cookie } })).status).toBe(404);
  });
});
