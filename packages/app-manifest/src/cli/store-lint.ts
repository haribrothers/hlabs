// `pnpm store:lint`: validate every app in store/ (manifest, compose rules, pinned images, logo).
import { relative, resolve } from 'node:path';
import { lintStore } from '../node';

const storeDir = resolve(process.argv[2] ?? 'store');
const apps = lintStore(storeDir);
let problems = 0;
for (const app of apps) {
  for (const issue of app.issues) {
    problems++;
    console.error(`${relative(process.cwd(), app.dir)}/${issue.file} ${issue.path}: ${issue.code} ${issue.message}`);
  }
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
