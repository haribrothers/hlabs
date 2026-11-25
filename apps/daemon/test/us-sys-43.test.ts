// US-SYS-43 · Set up a way to make apps public: Cloudflare Tunnel through "Sign in to Cloudflare" (or an API token),
// the credential in the keychain only, the tunnel and its connector, only the DNS records hlabs made, removing it all
// (apps private first), and Cloudflare in "What hlabs connects to". The real Cloudflare client and connector are
// checked with their process and `fetch` faked: nothing here reaches Cloudflare.
import { settings } from '@hlabs/db';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { CloudflareApi, parseOriginCert, signInLinkIn } from '../src/cloudflare/api';
import { connectorConfig } from '../src/cloudflare/connector';
import { FAKE_CLOUDFLARE_TOKEN } from '../src/cloudflare/fake';
import { CloudflareError } from '../src/cloudflare/types';
import { CLOUDFLARE_CREDENTIAL } from '../src/public/service';
import type { Reply } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';
import { HOST, publicFixture } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Status = { cloudflare: Record<string, unknown>; apps: Array<Record<string, unknown>> };
const status = async (t: Awaited<ReturnType<typeof publicFixture>>) =>
  (await t.d.query('public.status')).result!.data as unknown as Status;

describe('US-SYS-43', () => {
  it('until it is set up, Public access is off, and so is making an app public', async () => {
    const t = await publicFixture(closers, { setUp: false });
    expect((await status(t)).cloudflare).toMatchObject({ state: 'off', domain: null, credential: null });
    expect((await status(t)).apps).toEqual([]);
    const { reply } = await t.setPublic();
    expect(reply.error?.data.hlabsCode).toBe('PUBLIC_NOT_SET_UP');
    // Nothing on the public side of Caddy without a tunnel.
    expect(t.listener()).toBeNull();
  });

  it('"Sign in to Cloudflare" gives the link, waits for the domain, then makes the tunnel and starts its connector', async () => {
    const t = await publicFixture(closers, { setUp: false });
    const signIn = (await t.d.mutate('public.cloudflareSignIn')).result!.data as { url: string };
    expect(signIn.url).toBe(t.fake.signInUrl);
    expect((await status(t)).cloudflare).toMatchObject({ state: 'signingIn', signInUrl: t.fake.signInUrl });
    // A second press while waiting gives the same link, no second sign-in.
    expect(((await t.d.mutate('public.cloudflareSignIn')).result!.data as { url: string }).url).toBe(signIn.url);
    expect(t.fake.calls.filter((c) => c === 'signIn')).toHaveLength(1);

    // The admin approves in Cloudflare's tab and picks example.com.
    t.fake.finishSignIn();
    await new Promise((r) => setTimeout(r, 20));
    const job = t.s.jobs.latest('public_setup')!.id;
    const done = await t.s.jobs.settled(job);
    expect(done?.state).toBe('succeeded');
    expect(done?.kind).toBe('public_setup');
    const s = await status(t);
    expect(s.cloudflare).toMatchObject({
      state: 'on',
      domain: 'example.com',
      credential: 'signIn',
      reason: null,
      setUpBy: 'Hari',
    });
    // The connector runs for the tunnel, carrying every public name to the public listener on 127.0.0.1.
    expect(t.fake.state()).toBe('running');
    expect(t.fake.started?.origin).toBe(`http://127.0.0.1:${t.d.config.publicPort}`);
    expect(t.listener()).toMatchObject({ port: t.d.config.publicPort, apps: [] });
    expect(t.audits('public.cloudflare.setUp')).toHaveLength(1);
  });

  it('keeps the credential in the keychain only: never in SQLite, and the tunnel file is owner-only', async () => {
    const t = await publicFixture(closers);
    const stored = JSON.parse((await t.s.secrets.get(CLOUDFLARE_CREDENTIAL))!) as { token: string; domain: string };
    expect(stored).toMatchObject({ token: FAKE_CLOUDFLARE_TOKEN, domain: 'example.com', kind: 'token' });
    const everything = JSON.stringify(t.s.db.select().from(settings).all());
    expect(everything).not.toContain(FAKE_CLOUDFLARE_TOKEN);
    expect(everything).toContain('"domain":"example.com"');
    const tunnelFile = join(t.d.config.paths.dataDir, 'cloudflare', 'tunnel.json');
    expect(statSync(tunnelFile).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(tunnelFile, 'utf8'))).toHaveProperty('TunnelID');
  });

  it('"Use an API token instead": a token Cloudflare refuses, or one for another domain, keeps nothing', async () => {
    const t = await publicFixture(closers, { setUp: false });
    const wrong = await t.d.mutate('public.setupCloudflare', { domain: 'example.com', token: 'x'.repeat(40) });
    expect(wrong.error?.data).toMatchObject({ hlabsCode: 'CLOUDFLARE_FAILED', detail: { step: 'token' } });
    const other = await t.d.mutate('public.setupCloudflare', { domain: 'other.org', token: FAKE_CLOUDFLARE_TOKEN });
    expect(other.error?.data).toMatchObject({ hlabsCode: 'CLOUDFLARE_FAILED', detail: { step: 'zone' } });
    expect(await t.s.secrets.get(CLOUDFLARE_CREDENTIAL)).toBeNull();
    expect((await status(t)).cloudflare.state).toBe('off');
    // The right one sets it up; a second setup is refused while it is.
    await t.setUp();
    expect((await status(t)).cloudflare).toMatchObject({ state: 'on', credential: 'token' });
    const again = await t.d.mutate('public.setupCloudflare', { domain: 'example.com', token: FAKE_CLOUDFLARE_TOKEN });
    expect(again.error?.data.hlabsCode).toBe('PUBLIC_ALREADY_SET_UP');
  });

  it('a setup that fails at Cloudflare says where, and keeps no credential', async () => {
    const t = await publicFixture(closers, { setUp: false });
    t.fake.failing.add('tunnel');
    const job = await t.setUp();
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'CLOUDFLARE_FAILED' });
    expect((await status(t)).cloudflare).toMatchObject({ state: 'error', reason: 'tunnel' });
    expect(await t.s.secrets.get(CLOUDFLARE_CREDENTIAL)).toBeNull();
    t.fake.failing.clear();
    await t.setUp();
    expect((await status(t)).cloudflare.state).toBe('on');
  });

  it("only ever makes, and deletes, its own DNS records: a name in the domain's DNS already is refused", async () => {
    const t = await publicFixture(closers);
    const taken = await t.setPublic({ hostname: 'www' });
    expect(taken.reply.error?.data).toMatchObject({
      hlabsCode: 'PUBLIC_HOSTNAME_TAKEN',
      detail: { hostname: 'www.example.com' },
    });
    await t.setPublic({ hostname: 'vaultwarden' });
    expect(t.fake.hlabsRecords()).toEqual([HOST]);
    const own = () =>
      [...t.fake.records.values()]
        .filter((r) => !r.byHlabs)
        .map((r) => r.name)
        .sort();
    expect(own()).toEqual(['example.com', 'mail.example.com', 'www.example.com']);
    // What hlabs keeps of it: the record's id and name, nothing else.
    const kept = (await t.s.db.select().from(settings).all()).find((r) => r.key === 'public')!.valueJson as {
      cloudflare: { records: Array<{ name: string }> };
    };
    expect(kept.cloudflare.records.map((r) => r.name)).toEqual([HOST]);
  });

  it('removing it makes every public app private first, then deletes the tunnel, its records and the credential', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const reply = (await t.d.mutate('public.remove')) as Reply;
    const job = await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect(job).toMatchObject({ kind: 'public_remove', state: 'succeeded' });
    expect(t.publicRow()).toBeUndefined();
    expect(t.audits('app.public.off')).toEqual([
      expect.objectContaining({ target: 'vaultwarden', detailJson: expect.objectContaining({ why: 'remove' }) }),
    ]);
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect([...t.fake.records.values()].map((r) => r.name).sort()).toEqual([
      'example.com',
      'mail.example.com',
      'www.example.com',
    ]);
    expect(t.fake.tunnels.size).toBe(0);
    expect(t.fake.state()).toBe('stopped');
    expect(await t.s.secrets.get(CLOUDFLARE_CREDENTIAL)).toBeNull();
    expect(existsSync(join(t.d.config.paths.dataDir, 'cloudflare', 'tunnel.json'))).toBe(false);
    expect((await status(t)).cloudflare).toMatchObject({ state: 'off', domain: null });
    expect(t.listener()).toBeNull();
    expect(t.audits('public.cloudflare.removed')).toHaveLength(1);
  });

  it("removing when Cloudflare doesn't answer still makes the apps private and stops the connector", async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    t.fake.failing.add('remove');
    const reply = (await t.d.mutate('public.remove')) as Reply;
    const job = await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'CLOUDFLARE_FAILED' });
    expect(t.publicRow()).toBeUndefined();
    expect(t.fake.state()).toBe('stopped');
    expect((await status(t)).cloudflare).toMatchObject({ state: 'error', reason: 'remove', domain: 'example.com' });
    t.fake.failing.clear();
    const retry = (await t.d.mutate('public.remove')) as Reply;
    expect((await t.s.jobs.settled(retry.result!.data.jobId as string))?.state).toBe('succeeded');
    expect((await status(t)).cloudflare.state).toBe('off');
  });

  it('"What hlabs connects to" lists Cloudflare while the tunnel is set up', async () => {
    const t = await publicFixture(closers, { setUp: false });
    const connections = async () =>
      ((await t.d.query('system.connections')).result!.data as { connections: Array<{ id: string }> }).connections;
    expect((await connections()).some((c) => c.id === 'cloudflare')).toBe(false);
    await t.setUp();
    expect((await connections()).find((c) => c.id === 'cloudflare')).toMatchObject({
      kind: 'cloudflare',
      name: 'example.com',
      state: 'on',
    });
    const reply = (await t.d.mutate('public.remove')) as Reply;
    await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect((await connections()).some((c) => c.id === 'cloudflare')).toBe(false);
  });

  it('members can do none of it', async () => {
    const t = await publicFixture(closers, { setUp: false });
    const anu = await memberSession(t.d, { appIds: ['vaultwarden'] });
    for (const [path, input] of [
      ['public.cloudflareSignIn', undefined],
      ['public.setupCloudflare', { domain: 'example.com', token: FAKE_CLOUDFLARE_TOKEN }],
      ['public.remove', undefined],
      ['public.turnOffAll', undefined],
    ] as const) {
      const reply = await anu.mutate(path, input);
      expect(reply.error?.data.hlabsCode, path).toBe('ACCESS_DENIED');
    }
    expect((await anu.query('public.status')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect(t.fake.calls).toEqual([]);
  });
});

describe('US-SYS-43 · the real Cloudflare, with its process and API faked', () => {
  const cert = (json: object) =>
    `-----BEGIN ARGO TUNNEL TOKEN-----\n${Buffer.from(JSON.stringify(json)).toString('base64')}\n-----END ARGO TUNNEL TOKEN-----\n`;

  it("reads the zone, account and token out of cloudflared's origin certificate, and the link it prints", () => {
    expect(parseOriginCert(cert({ zoneID: 'z1', accountID: 'a1', apiToken: 'secret-token' }))).toEqual({
      zoneId: 'z1',
      accountId: 'a1',
      token: 'secret-token',
    });
    expect(parseOriginCert('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')).toBeNull();
    expect(
      signInLinkIn(
        'Please open the following URL and log in with your Cloudflare account:\n\nhttps://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc\n\nLeave cloudflared running',
      ),
    ).toBe('https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc');
  });

  it('signs in with its home in the data dir, deletes the certificate once read, and names the domain', async () => {
    const dir = tempDir();
    let env: NodeJS.ProcessEnv = {};
    let args: string[] = [];
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
      exitCode: null,
    }) as unknown as ChildProcess;
    const calls: string[] = [];
    const api = new CloudflareApi({
      binary: '/bin/cloudflared',
      dir,
      spawn: (_cmd, a, o) => ((args = a), (env = o.env), child),
      fetch: async (url, init) => {
        calls.push(`${init.method} ${url} ${(init.headers as Record<string, string>).authorization}`);
        return new Response(JSON.stringify({ success: true, result: { name: 'example.com' } }));
      },
    });
    const started = api.signIn();
    (child.stderr as PassThrough).write(
      'Please open the following URL and log in with your Cloudflare account:\nhttps://dash.cloudflare.com/argotunnel?aud=x\n',
    );
    const signIn = await started;
    expect(args).toEqual(['tunnel', 'login']);
    expect(env.HOME).toBe(join(dir, 'login'));
    expect(signIn.url).toBe('https://dash.cloudflare.com/argotunnel?aud=x');
    const certFile = join(dir, 'login', '.cloudflared', 'cert.pem');
    mkdirSync(join(dir, 'login', '.cloudflared'), { recursive: true });
    writeFileSync(certFile, cert({ zoneID: 'zone-1', accountID: 'acct-1', apiToken: 'tok-123' }));
    child.emit('exit', 0);
    expect(await signIn.done).toEqual({
      kind: 'signIn',
      token: 'tok-123',
      zoneId: 'zone-1',
      accountId: 'acct-1',
      domain: 'example.com',
    });
    expect(existsSync(certFile)).toBe(false);
    expect(calls).toEqual(['GET https://api.cloudflare.com/client/v4/zones/zone-1 Bearer tok-123']);
  });

  it('makes proxied CNAMEs to the tunnel, deletes only by record id, and never puts the token in an error', async () => {
    const sent: Array<{ method: string; url: string; body: unknown }> = [];
    let answer: { status: number; body: unknown } = { status: 200, body: { success: true, result: { id: 'rec-1' } } };
    const api = new CloudflareApi({
      binary: '/none',
      dir: tempDir(),
      fetch: async (url, init) => {
        sent.push({ method: init.method!, url, body: init.body ? JSON.parse(init.body as string) : null });
        return new Response(JSON.stringify(answer.body), { status: answer.status });
      },
    });
    const cred = { kind: 'token' as const, token: 'very-secret', zoneId: 'z', accountId: 'a', domain: 'example.com' };
    expect(await api.addRecord(cred, 'photos.example.com', 'tun-1')).toEqual({ id: 'rec-1' });
    expect(sent[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.cloudflare.com/client/v4/zones/z/dns_records',
      body: { type: 'CNAME', name: 'photos.example.com', content: 'tun-1.cfargotunnel.com', proxied: true },
    });
    answer = { status: 404, body: { success: false, errors: [{ code: 81044, message: 'Record not found' }] } };
    await api.deleteRecord(cred, 'rec-1');
    expect(sent[1]).toMatchObject({
      method: 'DELETE',
      url: 'https://api.cloudflare.com/client/v4/zones/z/dns_records/rec-1',
    });
    answer = { status: 403, body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } };
    const err = await api.checkToken('very-secret', 'example.com').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudflareError);
    expect((err as CloudflareError).step).toBe('token');
    expect(String((err as Error).message)).not.toContain('very-secret');
    answer = { status: 200, body: { success: true, result: [{ id: 'r' }] } };
    expect(await api.nameTaken(cred, 'www.example.com')).toBe(true);
    expect(sent.at(-1)!.url).toBe('https://api.cloudflare.com/client/v4/zones/z/dns_records?name=www.example.com');
  });

  it("runs the connector from a config file: the tunnel's credentials never on the command line", () => {
    const yaml = connectorConfig({
      tunnelId: 'tun-1',
      credentialsFile: '/data/cloudflare/tunnel.json',
      origin: 'http://127.0.0.1:7475',
    });
    expect(yaml).toBe(
      'tunnel: tun-1\ncredentials-file: "/data/cloudflare/tunnel.json"\nno-autoupdate: true\ningress:\n  - service: http://127.0.0.1:7475\n',
    );
  });
});
