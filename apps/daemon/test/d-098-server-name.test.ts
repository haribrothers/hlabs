// D-098 · The name on the network, chosen on setup's system step: saved with Continue (before anything is published
// under it), Caddy and mDNS follow it, and the system check reports it.
import { apps, getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeSystemProbe } from './fakes/system';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function atSystemStep() {
  const printed: string[] = [];
  const daemon = await startDaemon({ boot: { print: (line) => printed.push(line), system: new FakeSystemProbe() } });
  closers.push(daemon.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const headers = { 'content-type': 'application/json', 'x-hlabs-setup': token };
  const call = async (path: string, input?: unknown) =>
    (await (
      await fetch(`${daemon.url}/trpc/onboarding.${path}`, {
        method: input === undefined ? 'GET' : 'POST',
        headers,
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      })
    ).json()) as Reply;
  await call('setStep', { step: 'system' });
  return { ...daemon, call };
}

describe('D-098', () => {
  it('the system check reports the name; Continue saves a new one', async () => {
    const d = await atSystemStep();
    expect((await d.call('checkSystem')).result?.data.hostname).toBe('hlabs');
    expect((await d.call('confirmSystem', { startAtLogin: true, hostname: 'homebox' })).result?.data).toEqual({
      ok: true,
    });
    const db = d.services!.db;
    expect(getSetting(db, 'hostname')).toBe('homebox');
  });

  it('without a name, Continue keeps the current one', async () => {
    const d = await atSystemStep();
    await d.call('confirmSystem', { startAtLogin: true });
    expect(getSetting(d.services!.db, 'hostname')).toBe('hlabs');
  });

  it('refuses a name that is not lowercase letters, numbers and dashes, or ends with a dash', async () => {
    const d = await atSystemStep();
    for (const hostname of ['Home Box', '-home', 'home-', 'a'.repeat(41), '']) {
      expect((await d.call('confirmSystem', { startAtLogin: true, hostname })).error?.data.hlabsCode).toBe(
        'VALIDATION_FAILED',
      );
    }
    expect(getSetting(d.services!.db, 'hostname')).toBe('hlabs');
  });

  it("refuses a name an installed app's address already uses", async () => {
    const d = await atSystemStep();
    d.services!.db.insert(apps)
      .values({ id: 'jellyfin', version: '1', state: 'running', hostname: 'jellyfin', installedAt: 1, updatedAt: 1 })
      .run();
    expect((await d.call('confirmSystem', { startAtLogin: true, hostname: 'jellyfin' })).error?.data.hlabsCode).toBe(
      'HOSTNAME_TAKEN',
    );
  });
});
