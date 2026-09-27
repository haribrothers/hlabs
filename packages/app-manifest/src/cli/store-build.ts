// `pnpm store:build`: write store/index.json for the built-in source. CI signs it (store.yml).
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildStoreIndex } from '../node';

const storeDir = resolve(process.argv[2] ?? 'store');
const index = buildStoreIndex(storeDir, { id: 'builtin', name: 'hlabs' });
writeFileSync(join(storeDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.warn(`store:build: wrote index.json with ${index.apps.length} app(s)`);
