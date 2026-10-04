// US-INST-20 · Restart to update (server side): tray.status tells the tray about an update the dashboard asked for
// ("Update now", or the overnight window), and whether a job it must wait for is running (not the update itself).
import { jobs as jobsTable } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { startSystemUpdate } from '../src/updates/install';
import { FakeUpdateSource } from './fakes/update-source';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

async function status(url: string) {
  const res = await fetch(`${url}/trpc/tray.status`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const body = (await res.json()) as { result?: { data: Record<string, unknown> }; error?: unknown };
  if (!body.result) throw new Error(JSON.stringify(body.error));
  return body.result.data;
}

describe('US-INST-20 · Restart to update', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function daemon() {
    const source = new FakeUpdateSource();
    source.releases.stable = { version: '1.5.0' };
    const d = await startDaemon({
      config: { devAnonymousAdmin: false, version: '1.4.0' },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
      boot: { updateSource: source },
    });
    close = d.close;
    await d.services!.hlabsUpdates.check();
    return d;
  }

  it('an update asked for in the dashboard is in tray.status for the tray to apply', async () => {
    const d = await daemon();
    expect(await status(d.url)).toMatchObject({ updateRequested: null, exclusiveJobRunning: false });
    const { jobId } = startSystemUpdate(d.services!.systemUpdate, null);
    // The update itself is exclusive, but "Restart to update" doesn't wait for it.
    expect(await status(d.url)).toMatchObject({
      updateRequested: { jobId, version: '1.5.0' },
      exclusiveJobRunning: false,
    });
  });

  it('a restore or data move running makes "Restart to update" wait', async () => {
    const d = await daemon();
    d.services!.db.insert(jobsTable)
      .values({ id: ulid(), kind: 'restore', state: 'running', createdAt: Date.now() })
      .run();
    expect(await status(d.url)).toMatchObject({ exclusiveJobRunning: true, updateRequested: null });
  });
});
