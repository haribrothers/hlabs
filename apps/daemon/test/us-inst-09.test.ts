// US-INST-09 · Start at login: the daemon keeps the choice; the tray applies it and confirms with tray.setStartAtLogin,
// and reads the saved choice from tray.status to apply a change made in Settings.
import { getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { trayStatus } from '../src/tray/status';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

describe('US-INST-09 · Start at login', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('is on by default and tray.status carries it', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    expect((await trayStatus(d.services!)).startAtLogin).toBe(true);
  });

  it('tray.setStartAtLogin records what the tray applied, so Settings shows the same', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    const res = await fetch(`${d.url}/trpc/tray.setStartAtLogin`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    expect(getSetting(d.services!.db, 'startup').startAtLogin).toBe(false);
    expect((await trayStatus(d.services!)).startAtLogin).toBe(false);
  });

  it('a change in Settings asks the tray (startup.changeRequested) and shows in tray.status', async () => {
    const d = await startDaemon();
    close = d.close;
    const events: unknown[] = [];
    d.services!.bus.on((e) => events.push(e.event));
    const res = await fetch(`${d.url}/trpc/settings.startup.update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startAtLogin: false }),
    });
    expect(res.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'startup.changeRequested', data: { startAtLogin: false } }),
    );
    expect((await trayStatus(d.services!)).startAtLogin).toBe(false);
  });
});
