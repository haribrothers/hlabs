// US-APP-11 · Confirm uninstall: apps.get names the installed apps that need this one, and apps.uninstall refuses
// with APP_HAS_DEPENDENTS while one does.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MANIFEST_COPY } from '../src/apps/service';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  result?: { data: Record<string, unknown> };
  error?: { data: { hlabsCode: string; detail: Record<string, unknown> | null } };
};

describe('US-APP-11', () => {
  it('an app another installed app depends on lists it, and uninstalling it is refused', async () => {
    const t = await installDaemon(closers);
    for (const appId of ['vaultwarden', 'uptime-kuma']) {
      const res = (await t.d.mutate('apps.install', { appId })) as Reply;
      await t.s.jobs.settled(res.result!.data.jobId as string);
    }
    // Uptime Kuma needs Vaultwarden.
    const copy = join(t.s.apps.project('uptime-kuma').dir, MANIFEST_COPY);
    writeFileSync(copy, JSON.stringify({ ...JSON.parse(readFileSync(copy, 'utf8')), dependsOn: ['vaultwarden'] }));

    const get = (appId: string) =>
      t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId }))}`) as Promise<Reply>;
    expect((await get('vaultwarden')).result!.data.dependents).toEqual(['Uptime Kuma']);
    expect((await get('uptime-kuma')).result!.data.dependents).toEqual([]);

    const res = (await t.d.mutate('apps.uninstall', { appId: 'vaultwarden', keepData: true })) as Reply;
    expect(res.error?.data.hlabsCode).toBe('APP_HAS_DEPENDENTS');
    expect(res.error?.data.detail).toEqual({ appId: 'vaultwarden', dependents: ['Uptime Kuma'] });
  });
});
