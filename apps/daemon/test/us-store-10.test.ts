// US-STORE-10 · Fill in app settings and accept risky permissions.
import { appEnv, auditLog, setSetting, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test replies are read loosely
  result?: { data: Record<string, any> };
  error?: { data: { hlabsCode: string; detail?: Record<string, unknown> } };
};

/** Uptime Kuma with a raw DNS port (risky), and Vaultwarden with a required "Admin email" prompt. */
function fixture() {
  const dir = storeFixture();
  const kuma = join(dir, 'apps', 'uptime-kuma');
  writeFileSync(
    join(kuma, 'hlabs-app.yml'),
    readFileSync(join(kuma, 'hlabs-app.yml'), 'utf8') +
      'ports:\n  - { service: uptime-kuma, container: 53, protocol: udp, host: 53, label: DNS }\n',
  );
  writeFileSync(
    join(kuma, 'docker-compose.yml'),
    readFileSync(join(kuma, 'docker-compose.yml'), 'utf8').replace(
      '    volumes:',
      "    ports: ['53:53/udp']\n    volumes:",
    ),
  );
  const vw = join(dir, 'apps', 'vaultwarden', 'hlabs-app.yml');
  writeFileSync(
    vw,
    readFileSync(vw, 'utf8').replace(
      'env:\n',
      'env:\n  - { key: ADMIN_EMAIL, label: Admin email, type: string, required: true }\n',
    ),
  );
  return dir;
}

describe('US-STORE-10', () => {
  it('shows the visible prompts with their types and defaults; generated and hidden ones stay out', async () => {
    const t = await installDaemon(closers, { storeDir: fixture() });
    const get = async (appId: string) =>
      ((await t.d.query(`store.getApp?input=${encodeURIComponent(JSON.stringify({ appId }))}`)) as Reply).result!.data
        .install;
    expect((await get('immich')).env).toEqual([]);
    const vw = await get('vaultwarden');
    expect(vw.env.find((e: { key: string }) => e.key === 'ADMIN_EMAIL')).toMatchObject({
      label: 'Admin email',
      type: 'string',
      required: true,
    });
    expect(vw.env.find((e: { key: string }) => e.key === 'SIGNUPS_ALLOWED')).toMatchObject({ type: 'boolean' });
  });

  it('an empty required setting is APP_ENV_INVALID naming it; wrong types too', async () => {
    const t = await installDaemon(closers, { storeDir: fixture() });
    const res = (await t.d.mutate('apps.install', { appId: 'vaultwarden', env: {} })) as Reply;
    expect(res.error?.data).toMatchObject({
      hlabsCode: 'APP_ENV_INVALID',
      detail: { key: 'ADMIN_EMAIL', reason: 'required' },
    });
    const bad = (await t.d.mutate('apps.install', {
      appId: 'vaultwarden',
      env: { ADMIN_EMAIL: 'a@b.c', SIGNUPS_ALLOWED: 'maybe' },
    })) as Reply;
    expect(bad.error?.data.detail).toMatchObject({ key: 'SIGNUPS_ALLOWED', reason: 'boolean' });
    const ok = (await t.d.mutate('apps.install', {
      appId: 'vaultwarden',
      env: { ADMIN_EMAIL: 'hari@example.com' },
    })) as Reply;
    await t.s.jobs.settled(ok.result!.data.jobId);
    expect(
      t.s.db
        .select()
        .from(appEnv)
        .all()
        .find((e) => e.key === 'ADMIN_EMAIL')?.value,
    ).toBe('hari@example.com');
  });

  it('risky access needs "I understand", and agreeing is recorded with what was agreed to', async () => {
    const t = await installDaemon(closers, { storeDir: fixture() });
    const no = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    expect(no.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { acceptRisks: true } });
    const yes = (await t.d.mutate('apps.install', { appId: 'uptime-kuma', acceptRisks: true })) as Reply;
    await t.s.jobs.settled(yes.result!.data.jobId);
    const audit = t.s.db
      .select()
      .from(auditLog)
      .all()
      .find((a) => a.action === 'app.install');
    expect(audit?.detailJson).toMatchObject({ acceptedRisks: ['port:53/udp'] });
  });

  it('members install only built-in apps without risky access, and only while allowed', async () => {
    const t = await installDaemon(closers, { storeDir: fixture() });
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    const me = (await (await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as Reply;
    const headers = { 'content-type': 'application/json', cookie, 'x-hlabs-csrf': me.result!.data.csrfToken as string };
    const install = async (appId: string) =>
      (await (
        await fetch(`${t.d.url}/trpc/apps.install`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ appId, acceptRisks: true }),
        })
      ).json()) as Reply;
    expect((await install('vaultwarden')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    setSetting(t.s.db, 'people', {
      showUserList: true,
      requireTotp: false,
      membersCanInstall: true,
      membersCanSeeUsage: false,
    });
    expect((await install('uptime-kuma')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    const get = async (appId: string) =>
      (
        (await (
          await fetch(`${t.d.url}/trpc/store.getApp?input=${encodeURIComponent(JSON.stringify({ appId }))}`, {
            headers,
          })
        ).json()) as Reply
      ).result!.data.install;
    expect((await get('uptime-kuma')).allowed).toBe(false);
    expect((await get('immich')).allowed).toBe(true);
  });
});
