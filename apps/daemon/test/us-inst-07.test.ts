// US-INST-07 · Back up now from the menu: hidden until backups ship (phase 5); until then the daemon refuses it.
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

describe('US-INST-07 · Back up now from the menu', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it('tray.quickAction backupNow is not available before backups exist', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    const res = await fetch(`${d.url}/trpc/tray.quickAction`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'backupNow' }),
    });
    const body = (await res.json()) as { error?: { data: { hlabsCode: string } } };
    expect(body.error?.data.hlabsCode).toBe('NOT_IMPLEMENTED');
  });
});
