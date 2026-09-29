import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { describeDevice, lastSeen, networkOf } from './devices';
import { SignedInDevices } from './signed-in-devices';

const UA = {
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadChrome:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
  winChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  winEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
};

describe('US-ACCT-04', () => {
  it.each([
    [UA.macSafari, 'Mac', 'Safari'],
    [UA.iphoneSafari, 'iPhone', 'Safari'],
    [UA.ipadChrome, 'iPad', 'Chrome'],
    [UA.winChrome, 'Windows PC', 'Chrome'],
    [UA.winEdge, 'Windows PC', 'Edge'],
    [UA.linuxFirefox, 'Linux PC', 'Firefox'],
    [UA.androidChrome, 'Android phone', 'Chrome'],
    ['curl/8.6.0', 'Unknown device', 'Browser'],
    [null, 'Unknown device', 'Browser'],
  ])('user agent %s → %s · %s', (ua, device, browser) => {
    expect(describeDevice(ua)).toMatchObject({ device, browser });
  });

  it.each([
    ['100.101.102.103', 'tailscale'],
    ['100.64.0.1', 'tailscale'],
    ['100.128.0.1', 'internet'],
    ['fd7a:115c:a1e0::1', 'tailscale'],
    ['192.168.1.20', 'home'],
    ['10.0.0.5', 'home'],
    ['172.20.1.1', 'home'],
    ['::ffff:192.168.1.20', 'home'],
    ['fd12::1', 'home'],
    ['127.0.0.1', 'local'],
    ['::1', 'local'],
    ['8.8.8.8', 'internet'],
    [null, 'internet'],
  ])('IP %s → %s', (ip, network) => {
    expect(networkOf(ip)).toBe(network);
  });

  it('"active now" within 5 minutes, otherwise how long ago', () => {
    const now = 10 * 86_400_000;
    expect(lastSeen(now - 4 * 60_000, now)).toBe('active now');
    expect(lastSeen(now - 2 * 3_600_000, now)).toBe('2 hours ago');
    expect(lastSeen(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });

  it('lists this device first as "This device", then the others', async () => {
    const now = Date.now();
    renderScreen(SignedInDevices, {
      'auth.listSessions': () => ({
        items: [
          { id: 'a', current: true, userAgent: UA.macSafari, ip: '192.168.1.20', createdAt: 0, lastSeenAt: now },
          {
            id: 'b',
            current: false,
            userAgent: UA.iphoneSafari,
            ip: '100.101.1.2',
            createdAt: 0,
            lastSeenAt: now - 7_200_000,
          },
        ],
      }),
    });
    const list = await screen.findByRole('group', { name: 'Signed-in devices' });
    const rows = [...list.querySelectorAll('.hl-list-row')];
    expect(rows[0]).toHaveTextContent('Mac · Safari');
    expect(rows[0]).toHaveTextContent('Home network · active now');
    expect(within(rows[0] as HTMLElement).getByText('This device')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('iPhone · Safari');
    expect(rows[1]).toHaveTextContent('Tailscale · 2 hours ago');
  });
});
