// US-APP-09 · Filter logs: apps.get names the app's compose services for the Container choice, and apps.logs gives
// one service's lines when asked (text and level filters run in the dashboard).
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> } };

describe('US-APP-09', () => {
  it("apps.get lists the app's compose services; apps.logs narrows to one", async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' }],
    })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId as string);
    const q = (path: string, input: unknown) =>
      t.d.query(`${path}?input=${encodeURIComponent(JSON.stringify(input))}`) as Promise<Reply>;
    const services = (await q('apps.get', { appId: 'immich' })).result!.data.services as string[];
    expect(services.length).toBeGreaterThan(1);
    expect(services).toContain('immich-server');

    const containers = [...t.engine.containers.values()][0]!;
    for (const [i, c] of containers.entries()) {
      t.engine.addLog(c.id, { stream: 'stdout', ts: 100 + i, line: `hello from ${c.service}` });
    }
    const all = (await q('apps.logs', { appId: 'immich' })).result!.data.lines as Array<{ service: string }>;
    expect(new Set(all.map((l) => l.service)).size).toBe(containers.length);
    const one = (await q('apps.logs', { appId: 'immich', service: 'immich-server' })).result!.data.lines;
    expect(one).toEqual([expect.objectContaining({ service: 'immich-server', line: 'hello from immich-server' })]);
  });
});
