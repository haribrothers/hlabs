// `pnpm db:migrate`: apply pending migrations to a data dir (default ./.dev-data, like `pnpm dev`).
import { resolve } from 'node:path';
import { openDb } from './db';

const dataDir = resolve(process.env.INIT_CWD ?? process.cwd(), process.env.HLABS_DATA_DIR ?? '.dev-data');
openDb({ dataDir }).$client.close();
console.warn(`Migrated ${dataDir}/hlabs.db`);
