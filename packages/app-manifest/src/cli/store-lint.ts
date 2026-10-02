// `pnpm store:lint`: validate every app in store/ (manifest, compose rules, pinned images, logo) and curation.yml.
import { relative, resolve } from 'node:path';
import { curationIssues, lintStore, loadCuration } from '../node';

const storeDir = resolve(process.argv[2] ?? 'store');
const apps = lintStore(storeDir);
let problems = 0;
for (const app of apps) {
  for (const issue of app.issues) {
    problems++;
    console.error(`${relative(process.cwd(), app.dir)}/${issue.file} ${issue.path}: ${issue.code} ${issue.message}`);
  }
}
try {
  const ids = new Set(apps.flatMap((a) => (a.manifest ? [a.manifest.id] : [])));
  for (const issue of curationIssues(loadCuration(storeDir), ids)) {
    problems++;
    console.error(`curation.yml ${issue.path}: ${issue.code} ${issue.message}`);
  }
} catch (error) {
  problems++;
  console.error(`curation.yml: CURATION_INVALID ${(error as Error).message}`);
}
if (apps.length === 0) {
  console.error(`No apps found in ${storeDir}/apps`);
  process.exit(1);
}
if (problems > 0) {
  console.error(`\n${problems} problem(s) in ${apps.length} app(s).`);
  process.exit(1);
}
console.warn(`store:lint: ${apps.length} app(s) OK`);
