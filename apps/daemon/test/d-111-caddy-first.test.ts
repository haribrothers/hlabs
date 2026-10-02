// D-111 · Caddy starts before Tailscale Serve: while Caddy starts, hlabs's own Serve entries are off Caddy's web
// ports, then served again; nobody else's entries are touched.
import { getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function connected() {
  const d = await daemonWithAdmin(closers);
  const ts = d.services!.tailscale as FakeTailscale;
  ts.current = { kind: 'running', tailnet: 'tail9.ts.net', nodeName: 'hari-home', httpsEnabled: true, keyExpiry: null };
  // Someone else's entry on another port.
  ts.config = { TCP: { '3000': { HTTPS: true } } };
  await d.mutate('network.remote.connect', { confirmTailnet: true });
  return { d, ts, remote: d.services!.remote };
}

describe('D-111', () => {
  it("takes hlabs's entry off 443 while Caddy starts, then serves it again", async () => {
    const { ts, remote } = await connected();
    expect(Object.keys(ts.config.TCP!).sort()).toEqual(['3000', '443']);
    let during: string[] = [];
    await remote.whileReleased([443, 80], async () => {
      during = Object.keys(ts.config.TCP!).sort();
    });
    expect(during).toEqual(['3000']);
    expect(Object.keys(ts.config.TCP!).sort()).toEqual(['3000', '443']);
  });

  it('tries Caddy again while Tailscale lets go of the port', async () => {
    const { remote } = await connected();
    let tries = 0;
    await remote.whileReleased([443], async () => {
      if (++tries < 3) throw new Error('address already in use');
    });
    expect(tries).toBe(3);
  });

  it('serves again even when Caddy fails to start', async () => {
    const { ts, remote } = await connected();
    await expect(
      remote.whileReleased([443], async () => {
        throw new Error('caddy exited');
      }),
    ).rejects.toThrow('caddy exited');
    expect(Object.keys(ts.config.TCP!)).toContain('443');
  });

  it("not connected, or Tailscale can't be reached: Caddy just starts", async () => {
    const d = await daemonWithAdmin(closers);
    let ran = 0;
    await d.services!.remote.whileReleased([443], async () => void ran++);
    const { ts, remote, d: d2 } = await connected();
    ts.current = { kind: 'stopped' };
    ts.serveConfig = async () => {
      throw new Error('not running');
    };
    await remote.whileReleased([443], async () => void ran++);
    expect(ran).toBe(2);
    expect(getSetting(d2.services!.db, 'remote').state).toBe('connected');
  });
});
