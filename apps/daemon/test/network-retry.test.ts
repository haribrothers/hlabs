// A network config that can't be applied (Caddy couldn't start: another program held port 443, such as a second
// hlabs) is tried again after 30 s, then less often, rather than only at the next periodic sync; never after stop.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/logger';
import { NetworkService, RETRY_MAX_MS, RETRY_MS } from '../src/network/service';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of closers.splice(0)) await close();
});

async function service(failures: number) {
  const d = await startDaemon();
  closers.push(d.close);
  let applies = 0;
  const proxy = {
    apply: vi.fn(async () => {
      applies++;
      if (applies <= failures) throw new Error('caddy exited at start: listen tcp :443: bind: address already in use');
    }),
  };
  const network = new NetworkService({
    db: d.services!.db,
    proxy: proxy as never,
    mdns: { sync: async () => {}, isPublished: () => false } as never,
    logger: silentLogger(),
    routes: () => [],
    dashboardUpstream: '127.0.0.1:1',
    daemon: '127.0.0.1:1',
  });
  return { network, proxy };
}

describe('the proxy is tried again when it could not start', () => {
  it('after 30 s, then twice as long, until it works', async () => {
    const { network, proxy } = await service(2);
    vi.useFakeTimers();
    await network.sync();
    expect(proxy.apply).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(proxy.apply).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(proxy.apply).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(proxy.apply).toHaveBeenCalledTimes(3);
    // It worked: no more tries.
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS * 2);
    expect(proxy.apply).toHaveBeenCalledTimes(3);
  });

  it('never after stop', async () => {
    const { network, proxy } = await service(10);
    vi.useFakeTimers();
    await network.sync();
    network.stop();
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS);
    expect(proxy.apply).toHaveBeenCalledTimes(1);
  });
});
