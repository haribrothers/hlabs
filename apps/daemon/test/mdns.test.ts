// mDNS names (02 §2.6, D-074): one publisher process per name at the LAN address.
import { EventEmitter } from 'node:events';
import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { avahiCommand, dnsSdCommand, lanAddress, ProcessMdnsPublisher, type Child } from '../src/mdns/publisher';

class FakeChild extends EventEmitter implements Child {
  killed = false;
  constructor(
    readonly file: string,
    readonly args: string[],
  ) {
    super();
  }
  kill() {
    this.killed = true;
    this.emit('exit', null);
    return true;
  }
}

function setup(address: { value: string | null } = { value: '192.168.1.20' }) {
  const children: FakeChild[] = [];
  const publisher = new ProcessMdnsPublisher({
    logger: silentLogger(),
    command: avahiCommand,
    address: () => address.value,
    spawn: (file, args) => {
      const child = new FakeChild(file, args);
      children.push(child);
      return child;
    },
    restartDelayMs: 0,
    addressCheckMs: 60_000,
  });
  const live = () => children.filter((c) => !c.killed).map((c) => c.args.join(' '));
  return { publisher, children, live, address };
}

describe('ProcessMdnsPublisher', () => {
  it('holds one process per name and withdraws names that are no longer wanted', async () => {
    const t = setup();
    await t.publisher.sync(['hlabs.local', 'immich.hlabs.local']);
    expect(t.live()).toEqual(['-a -R hlabs.local 192.168.1.20', '-a -R immich.hlabs.local 192.168.1.20']);
    await t.publisher.sync(['hlabs.local', 'immich.hlabs.local']);
    expect(t.children).toHaveLength(2);
    await t.publisher.sync(['hlabs.local']);
    expect(t.live()).toEqual(['-a -R hlabs.local 192.168.1.20']);
    await t.publisher.unpublishAll();
    expect(t.live()).toEqual([]);
  });

  it('moves every name when the LAN address changes', async () => {
    const t = setup();
    await t.publisher.sync(['hlabs.local']);
    t.address.value = '10.0.0.5';
    await t.publisher.sync(['hlabs.local']);
    expect(t.live()).toEqual(['-a -R hlabs.local 10.0.0.5']);
  });

  it('publishes nothing without a LAN address', async () => {
    const t = setup({ value: null });
    await t.publisher.sync(['hlabs.local']);
    expect(t.children).toEqual([]);
  });

  it('starts a publisher again when it dies', async () => {
    const t = setup();
    await t.publisher.sync(['hlabs.local']);
    t.children[0]!.emit('exit', 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(t.children).toHaveLength(2);
    expect(t.live()).toEqual(['-a -R hlabs.local 192.168.1.20', '-a -R hlabs.local 192.168.1.20']);
  });

  it('stops retrying when the tool isn’t installed', async () => {
    const t = setup();
    await t.publisher.sync(['hlabs.local']);
    t.children[0]!.emit('error', Object.assign(new Error('spawn avahi-publish ENOENT'), { code: 'ENOENT' }));
    t.children[0]!.emit('exit', null);
    await new Promise((r) => setTimeout(r, 10));
    expect(t.children).toHaveLength(1);
  });
});

describe('commands', () => {
  it('macOS registers a proxy record with dns-sd; Linux an address record with Avahi', () => {
    expect(dnsSdCommand(() => 443)('immich.hlabs.local', '192.168.1.20')).toEqual({
      file: 'dns-sd',
      args: ['-P', 'immich.hlabs', '_https._tcp', 'local', '443', 'immich.hlabs.local', '192.168.1.20'],
    });
    expect(avahiCommand('hlabs.local', '192.168.1.20')).toEqual({
      file: 'avahi-publish',
      args: ['-a', '-R', 'hlabs.local', '192.168.1.20'],
    });
  });
});

describe('lanAddress', () => {
  const v4 = (address: string, internal = false) =>
    ({ address, family: 'IPv4', internal, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;

  it('prefers wired, then Wi-Fi, and skips loopback, bridges, VPNs and link-local addresses', () => {
    expect(
      lanAddress({
        lo0: [v4('127.0.0.1', true)],
        bridge100: [v4('192.168.64.1')],
        utun4: [v4('100.64.0.3')],
        docker0: [v4('172.17.0.1')],
        wlan0: [v4('192.168.1.30')],
        en0: [v4('169.254.10.10'), v4('192.168.1.20')],
      }),
    ).toBe('192.168.1.20');
    expect(lanAddress({ wlan0: [v4('192.168.1.30')], docker0: [v4('172.17.0.1')] })).toBe('192.168.1.30');
    expect(lanAddress({ lo: [v4('127.0.0.1', true)] })).toBeNull();
  });
});
