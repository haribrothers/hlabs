// The site as its tests see it (11: tests never reach the internet): releases and release notes from e2e/fixtures,
// and a copy of store/ in which Gitea has no screenshots (US-SITE-04), built to dist-e2e. Everything it makes is in
// .e2e/ and dist-e2e/, so the site's own generated files stay as they are.
//   pnpm --filter @hlabs/site test:e2e     (this, then Playwright)
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const site = resolve(import.meta.dirname, '..');
const root = resolve(site, '../..');
const work = join(site, '.e2e');
const store = join(work, 'store');
const publicDir = join(work, 'public');
rmSync(work, { recursive: true, force: true });
cpSync(join(site, 'public'), publicDir, {
  recursive: true,
  filter: (f) => !/install\.sh/.test(f),
});
cpSync(join(root, 'store'), store, { recursive: true });
rmSync(join(store, 'apps/gitea/screenshots'), { recursive: true, force: true });

const env = {
  ...process.env,
  HLABS_SITE_RELEASES_FIXTURE: join(site, 'e2e/fixtures/releases'),
  HLABS_SITE_RELEASE_NOTES: join(site, 'e2e/fixtures/release-notes'),
  HLABS_STORE_DIR: store,
  HLABS_SITE_PUBLIC_DIR: publicDir,
  HLABS_SITE_RELEASES_JSON: join(work, 'releases.json'),
  HLABS_SITE_OUT_DIR: './dist-e2e',
};
execFileSync('node', [join(root, 'scripts/site-releases.ts')], { stdio: 'inherit', env });
execFileSync('pnpm', ['exec', 'astro', 'build', '--silent'], { cwd: site, stdio: 'inherit', env });
