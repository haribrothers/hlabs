// A copy of the built-in store for store tests, with one app changed to have no arm64 image.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers';

export const REPO_STORE = fileURLToPath(new URL('../../../store', import.meta.url));

export function storeFixture(options: { amd64Only?: string[]; curation?: string } = {}): string {
  const dir = join(tempDir('store-'), 'store');
  cpSync(REPO_STORE, dir, { recursive: true });
  for (const id of options.amd64Only ?? []) {
    const file = join(dir, 'apps', id, 'hlabs-app.yml');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/platforms: \[[^\]]*\]/, 'platforms: [linux/amd64]'));
  }
  if (options.curation !== undefined) writeFileSync(join(dir, 'curation.yml'), options.curation);
  return dir;
}
