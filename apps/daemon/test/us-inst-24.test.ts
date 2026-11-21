// US-INST-24 · tray.setupUrl for `hlabs setup-url`: the setup URL at each LAN address and at the `.local` name while
// it's published, on Caddy's HTTP port with the port when it isn't 80; only this computer's URL without Caddy; nothing
// once onboarding is done.
import { describe, expect, it } from 'vitest';
import { setupUrls, type SetupUrlDeps } from '../src/tray/setup-url';

const TOKEN = 'tok';
function deps({ published = true, http = 80, done = false, proxy = 'caddy' as 'caddy' | 'none' } = {}): SetupUrlDeps {
  const port = http === 80 ? '' : `:${http}`;
  return {
    config: { proxy },
    onboarding: {
      setupUrl: async () => (done ? null : `http://127.0.0.1:7474/setup?token=${TOKEN}`),
      lanSetupUrls: async (hosts) => (done ? [] : hosts.map((h) => `http://${h}${port}/setup?token=${TOKEN}`)),
    },
    routing: {
      homeNetwork: () => ({
        hostname: 'homeserver',
        localAddress: 'https://homeserver.local',
        dnsAddress: 'https://homeserver.home.arpa',
        published,
        lanAddresses: ['192.168.1.40'],
        fallbackAddress: published ? null : 'https://192.168.1.40',
      }),
    },
  };
}

describe('US-INST-24', () => {
  it('gives the .local name and each LAN address', async () => {
    expect(await setupUrls(deps())).toEqual({
      url: 'http://127.0.0.1:7474/setup?token=tok',
      lanUrls: ['http://192.168.1.40/setup?token=tok'],
      mdnsUrl: 'http://homeserver.local/setup?token=tok',
    });
  });

  it('includes a fallback port, and leaves out the name while it is not published', async () => {
    expect(await setupUrls(deps({ http: 8080, published: false }))).toMatchObject({
      lanUrls: ['http://192.168.1.40:8080/setup?token=tok'],
      mdnsUrl: null,
    });
  });

  it('only this computer without Caddy, and nothing once setup is finished', async () => {
    expect(await setupUrls(deps({ proxy: 'none' }))).toEqual({
      url: 'http://127.0.0.1:7474/setup?token=tok',
      lanUrls: [],
      mdnsUrl: null,
    });
    expect(await setupUrls(deps({ done: true }))).toEqual({ url: null, lanUrls: [], mdnsUrl: null });
  });
});
