// The site as its tests see it (11: tests never reach the internet): releases and release notes from e2e/fixtures,
// and a copy of store/ in which Gitea has no screenshots (US-SITE-04), built to dist-e2e. Everything it makes is in
// .e2e/ and dist-e2e/, so the site's own generated files stay as they are. A second build, dist-e2e-beta, has only
// the fixture's beta: the site before the first stable release.
//   pnpm --filter @hlabs/site test:e2e     (this, then Playwright)
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** Builds the site with a release fixture into an output folder of its own. */
function build(releases: string, outDir: string) {
  const env = {
    ...process.env,
    HLABS_SITE_RELEASES_FIXTURE: releases,
    HLABS_SITE_RELEASE_NOTES: join(site, 'e2e/fixtures/release-notes'),
    HLABS_STORE_DIR: store,
    HLABS_SITE_PUBLIC_DIR: publicDir,
    HLABS_SITE_RELEASES_JSON: join(work, `releases-${outDir}.json`),
    HLABS_SITE_OUT_DIR: `./${outDir}`,
  };
  rmSync(join(publicDir, 'install.sh'), { force: true });
  execFileSync('node', [join(root, 'scripts/site-releases.ts')], { stdio: 'inherit', env });
  execFileSync('pnpm', ['run', 'site:build'], { cwd: site, stdio: 'inherit', env });
}

const fixture = join(site, 'e2e/fixtures/releases');
build(fixture, 'dist-e2e');

// Before the first stable release: the same fixture with only its beta (US-SITE-02, served on its own port).
const betaOnly = join(work, 'releases-beta-only');
cpSync(fixture, betaOnly, { recursive: true });
const all = JSON.parse(readFileSync(join(fixture, 'releases.json'), 'utf8')) as Array<{ prerelease: boolean }>;
writeFileSync(
  join(betaOnly, 'releases.json'),
  JSON.stringify(
    all.filter((r) => r.prerelease),
    null,
    2,
  ),
);
build(betaOnly, 'dist-e2e-beta');
