// US-INST-06 · Open the dashboard and copy its address: tray.quickAction gives the dashboard's current address.
import { setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

async function quickAction(url: string, action: string) {
  const res = await fetch(`${url}/trpc/tray.quickAction`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return (await res.json()) as { result?: { data: { url: string } } };
}

describe('US-INST-06 · Open the dashboard and copy its address', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('gives the dashboard address for Open Dashboard and Copy dashboard address', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    expect((await quickAction(d.url, 'openDashboard')).result?.data).toEqual({ url: 'http://127.0.0.1:5173' });
    expect((await quickAction(d.url, 'copyAddress')).result?.data).toEqual({ url: 'http://127.0.0.1:5173' });
  });

  it('follows a renamed computer and a changed HTTPS port behind Caddy, never a fixed address', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    const { db } = d.services!;
    setSetting(db, 'hostname', 'den');
    setSetting(db, 'network', {
      ...(await import('@hlabs/db')).getSetting(db, 'network'),
      ports: { https: 8443, http: 8080 },
    });
    const { dashboardUrl } = await import('../src/tray/status');
    const routing = d.services!.routing;
    const url = dashboardUrl({ config: { ...d.config, proxy: 'caddy' }, routing });
    expect(url).toMatch(/^https:\/\/(den\.local|\d+\.\d+\.\d+\.\d+):8443$/);
  });
});
