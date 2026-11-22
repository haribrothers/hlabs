// Installed store apps with a newer version waiting (the update stories, US-STORE-15…17, US-SYS-25): each app is
// installed, then its manifest in the store gets `version` (and optionally a change), another image and release notes,
// and the store is synced again.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeProbes, installDaemon } from './install-harness';
import { storeFixture } from './store-fixture';

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

/** Another image digest per app, so the update pulls something new. */
export const newDigest = (appId: string) => (appId === 'vaultwarden' ? 'c' : 'b').repeat(64);

export async function withInstalled(closers: Array<() => Promise<void>>, appIds: string[]) {
  const storeDir = storeFixture();
  const t = await installDaemon(closers, { storeDir, probes: fakeProbes(() => 200) });
  for (const appId of appIds) {
    const res = (await t.d.mutate('apps.install', { appId })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId as string);
  }
  /** Puts `version` in the store for `appId`; `change` edits the manifest's text further. */
  const publish = (appId: string, version: string, change: (yml: string) => string = (y) => y) => {
    const dir = join(storeDir, 'apps', appId);
    const manifest = change(
      readFileSync(join(dir, 'hlabs-app.yml'), 'utf8')
        .replace(/^version: .*$/m, `version: '${version}'`)
        .replace(/\nreleaseNotes: \|\n( {2}.*\n?)*/, '\n')
        .concat(`\nreleaseNotes: |\n  - ${appId} ${version} notes\n`),
    );
    writeFileSync(join(dir, 'hlabs-app.yml'), manifest);
    const compose = readFileSync(join(dir, 'docker-compose.yml'), 'utf8').replace(
      /@sha256:[0-9a-f]{64}/,
      `@sha256:${newDigest(appId)}`,
    );
    writeFileSync(join(dir, 'docker-compose.yml'), compose);
  };
  const sync = (now?: number) => t.s.catalog.syncBuiltin(now);
  return { ...t, storeDir, publish, sync };
}
