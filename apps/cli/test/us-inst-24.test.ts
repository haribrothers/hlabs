// US-INST-24 · Finish setup in the browser after the Linux install: `hlabs setup-url` prints where to finish setup (the
// `.local` name and each LAN address) until onboarding is done; the installer's run first says whether the name was
// announced. Against a pretend hlabsd on loopback that checks the tray token from the data dir (D-035).
import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PretendHlabs } from './helpers';

let hlabs: PretendHlabs;
beforeEach(() => {
  hlabs = new PretendHlabs();
});
afterEach(() => hlabs.close());

const daemon = async (answers: Record<string, () => unknown>) => (await hlabs.start(answers)).port;
const cli = async (argv: string[], _port: number) => {
  const { code, out, err } = await hlabs.cli(argv);
  return { code, out, err };
};
const dir = () => hlabs.dir;

const urls = (mdns: boolean) => ({
  url: 'http://127.0.0.1:7474/setup?token=abc',
  lanUrls: ['http://192.168.1.40/setup?token=abc'],
  mdnsUrl: mdns ? 'http://homeserver.local/setup?token=abc' : null,
});

describe('US-INST-24', () => {
  it('prints the .local address, then each LAN address', async () => {
    const port = await daemon({ 'tray.setupUrl': () => urls(true) });
    expect(await cli(['setup-url'], port)).toEqual({
      code: 0,
      err: '',
      out: [
        'Finish setup in your browser:',
        '  http://homeserver.local/setup?token=abc',
        '  or http://192.168.1.40/setup?token=abc',
      ].join('\n'),
    });
  });

  it('for the installer, says the name was announced once it is', async () => {
    let calls = 0;
    const port = await daemon({ 'tray.setupUrl': () => urls(++calls > 2) });
    const { out } = await cli(['setup-url', '--installer'], port);
    expect(out.split('\n')[0]).toBe('✓ Announced homeserver.local on your network');
    expect(out).toContain('  http://homeserver.local/setup?token=abc');
  });

  it('without Avahi, prints only the IP address and says the .local name is not available', async () => {
    const port = await daemon({ 'tray.setupUrl': () => urls(false) });
    const { out } = await cli(['setup-url', '--installer'], port);
    expect(out).toBe(
      [
        "! The .local name isn't available on this network (is Avahi running?), so use the IP address",
        'Finish setup in your browser:',
        '  http://192.168.1.40/setup?token=abc',
      ].join('\n'),
    );
    // A name that's announced for a moment and then fails isn't claimed.
    let calls = 0;
    const flaky = await daemon({ 'tray.setupUrl': () => urls(++calls === 1) });
    expect((await cli(['setup-url', '--installer'], flaky)).out).not.toContain('Announced');
  });

  it('once setup is finished, says so with the dashboard address', async () => {
    const port = await daemon({
      'tray.setupUrl': () => ({ url: null, lanUrls: [], mdnsUrl: null }),
      'tray.status': () => ({ dashboardUrl: 'https://homeserver.local' }),
    });
    expect((await cli(['setup-url'], port)).out).toBe('Setup is finished. Open hlabs at https://homeserver.local');
  });

  it("says what to do when it can't read the token or reach hlabs", async () => {
    const port = await daemon({ 'tray.setupUrl': () => urls(true) });
    if (process.getuid?.() !== 0) {
      chmodSync(join(dir(), 'tray.token'), 0o000);
      expect(await cli(['setup-url'], port)).toMatchObject({
        code: 77,
        err: 'Run with sudo or add yourself to the hlabs group',
      });
      chmodSync(join(dir(), 'tray.token'), 0o640);
    }
    writeFileSync(join(dir(), 'tray.token'), 'wrong\n');
    expect((await cli(['setup-url'], port)).err).toContain("hlabs didn't accept its token");
    await hlabs.stop();
    expect(await cli(['setup-url'], port)).toMatchObject({
      code: 2,
      err: "Can't reach hlabs. Check that it's running: systemctl status hlabsd",
    });
    rmSync(join(dir(), 'tray.token'));
    expect((await cli(['setup-url'], port)).err).toContain("hlabs isn't installed on this computer");
  });
});
