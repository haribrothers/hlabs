// D-105 · Apps open on the name the dashboard was reached on: home.arpa from a home.arpa dashboard.
import { describe, expect, it } from 'vitest';
import { appAddress } from './app-address';

const named = { local: 'https://immich.harilabs.local', tailnet: 'https://hari-home.tail9.ts.net:14001' };
const ownPort = { local: 'https://harilabs.local:12001', tailnet: null };
const at = (hostname: string) => ({ hostname });

describe('D-105', () => {
  it('on home.arpa, the app on home.arpa: its name, or its own port on the dashboard name', () => {
    expect(appAddress(named, at('harilabs.home.arpa'))).toBe('https://immich.harilabs.home.arpa');
    expect(appAddress(ownPort, at('harilabs.home.arpa'))).toBe('https://harilabs.home.arpa:12001');
    expect(appAddress({ local: 'https://immich.harilabs.local:8443/', tailnet: null }, at('harilabs.home.arpa'))).toBe(
      'https://immich.harilabs.home.arpa:8443/',
    );
  });

  it('on .local the .local address; on the tailnet the tailnet one', () => {
    expect(appAddress(named, at('harilabs.local'))).toBe('https://immich.harilabs.local');
    expect(appAddress(named, at('hari-home.tail9.ts.net'))).toBe('https://hari-home.tail9.ts.net:14001');
    expect(appAddress(ownPort, at('hari-home.tail9.ts.net'))).toBe('https://harilabs.local:12001');
  });
});
