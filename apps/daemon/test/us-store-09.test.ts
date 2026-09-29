// US-STORE-09 · Review included services, address and login: what the sheet shows, and the address apps.install takes.
import { apps } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, any> }; error?: { data: { hlabsCode: string } } }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('US-STORE-09', () => {
  it('names each service with its role and product, and whether the hlabs login protects it', async () => {
    const t = await installDaemon(closers);
    const get = async (appId: string) =>
      ((await t.d.query(`store.getApp?input=${encodeURIComponent(JSON.stringify({ appId }))}`)) as Reply).result!.data;
    const immich = await get('immich');
    expect(immich.services).toEqual(
      expect.arrayContaining([
        { name: 'immich-server', role: 'server', product: null },
        { name: 'database', role: 'database', product: 'PostgreSQL' },
        { name: 'redis', role: 'cache', product: 'Valkey' },
      ]),
    );
    expect(immich.install).toMatchObject({ webAuth: 'hlabs', ownLogin: true });
    expect((await get('vaultwarden')).install).toMatchObject({ webAuth: 'hlabs', ownLogin: true });
    expect(immich.install.takenHostnames).toEqual(expect.arrayContaining(['hlabs', 'www']));
  });

  it('the address must be lowercase letters, numbers and dashes, and free', async () => {
    const t = await installDaemon(closers);
    const install = (appId: string, hostname: string) =>
      t.d.mutate('apps.install', { appId, hostname }) as Promise<Reply>;
    expect((await install('uptime-kuma', 'Bad Name')).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect((await install('uptime-kuma', 'hlabs')).error?.data.hlabsCode).toBe('HOSTNAME_TAKEN');
    expect((await install('uptime-kuma', 'www')).error?.data.hlabsCode).toBe('HOSTNAME_TAKEN');
    const ok = (await install('uptime-kuma', 'status')) as Reply;
    await t.s.jobs.settled(ok.result!.data.jobId);
    expect(t.s.db.select().from(apps).get()?.hostname).toBe('status');
    expect((await install('vaultwarden', 'status')).error?.data.hlabsCode).toBe('HOSTNAME_TAKEN');
  });
});
