// A copy of part of the built-in store for store tests (three apps, so tests don't change as the store grows), with
// apps optionally changed to have no arm64 image.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers';

export const REPO_STORE = fileURLToPath(new URL('../../../store', import.meta.url));

// What the store pins today, read rather than written into tests: the update bot moves versions and images
// (US-STORE-24).
const storeFile = (appId: string, file: string) => readFileSync(join(REPO_STORE, 'apps', appId, file), 'utf8');
/** The app's `version` in the built-in store. */
export const storeVersion = (appId: string) => /^version: '?([^'\n]+)'?$/m.exec(storeFile(appId, 'hlabs-app.yml'))![1]!;
/** The first image in the app's compose file, as pinned: `repo:tag@sha256:…`. */
export const storeImage = (appId: string) => /^\s*image: (\S+)$/m.exec(storeFile(appId, 'docker-compose.yml'))![1]!;

/** The apps store tests use, and the curation they were written against. */
export const FIXTURE_APPS = ['immich', 'uptime-kuma', 'vaultwarden'];
const FIXTURE_CURATION = `featured: [immich, vaultwarden]
collections:
  - id: popular
    title: Popular with families
    appIds: [immich, vaultwarden, uptime-kuma]
rank: [immich, vaultwarden, uptime-kuma]
`;

export function storeFixture(options: { amd64Only?: string[]; curation?: string; apps?: string[] } = {}): string {
  const dir = join(tempDir('store-'), 'store');
  mkdirSync(join(dir, 'apps'), { recursive: true });
  for (const id of options.apps ?? FIXTURE_APPS)
    cpSync(join(REPO_STORE, 'apps', id), join(dir, 'apps', id), { recursive: true });
  writeFileSync(join(dir, 'curation.yml'), FIXTURE_CURATION);
  for (const id of options.amd64Only ?? []) {
    const file = join(dir, 'apps', id, 'hlabs-app.yml');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/platforms: \[[^\]]*\]/, 'platforms: [linux/amd64]'));
  }
  if (options.curation !== undefined) writeFileSync(join(dir, 'curation.yml'), options.curation);
  return dir;
}
