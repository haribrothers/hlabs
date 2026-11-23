// US-ONB-21 · See a summary when setup is done: what the finish screen reads (server side).
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ONB-21', () => {
  it('after setup the admin can read the storage root, two-factor state and whether this is headless', async () => {
    const d = await daemonWithAdmin(closers, { headless: true });
    await d.mutate('onboarding.setStep', { step: 'storage' });
    await d.mutate('onboarding.setStorage', { kind: 'local' });
    await d.mutate('onboarding.complete');

    const locations = (await d.query('storage.locations.list')).result!.data.locations as Array<
      Record<string, unknown>
    >;
    expect(locations).toEqual([
      {
        id: expect.any(String),
        kind: 'local',
        name: 'This computer',
        path: d.config.paths.storageRootDefault,
        isRoot: true,
        status: 'ok',
        // US-FILE-11, US-FILE-12, US-FILE-25.
        autoMount: true,
        appsAllowed: true,
        usedBy: [],
        readOnly: false,
        // US-SYS-12.
        displayPath: d.config.paths.storageRootDefault,
        address: null,
      },
    ]);
    expect((await d.query('auth.me')).result?.data).toMatchObject({
      displayName: 'Hari',
      username: 'hari',
      totpEnabled: false,
    });
    expect(((await d.query('system.info')).result!.data.os as { headless: boolean }).headless).toBe(true);
  });
});
