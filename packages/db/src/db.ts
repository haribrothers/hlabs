// Opens <dataDir>/hlabs.db, applies pending migrations in one transaction and refuses to run
// against a schema newer than this build knows (docs/prd/11-testing-release.md §Versioning).
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index';

export type HlabsDb = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/** The database was written by a newer hlabs; starting would risk corrupting it. */
export class SchemaTooNewError extends Error {
  override readonly name = 'SchemaTooNewError';
}

/** A migration failed and was rolled back. Maps to /healthz reason `migration_failed`. */
export class MigrationFailedError extends Error {
  override readonly name = 'MigrationFailedError';
}

export interface OpenDbOptions {
  /** `:memory:` or a file path. Defaults to `<dataDir>/hlabs.db`. */
  file?: string;
  dataDir?: string;
  migrationsDir?: string;
}

interface Journal {
  entries: Array<{ when: number; tag: string }>;
}

function latestKnownMigration(migrationsDir: string): number {
  const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as Journal;
  return Math.max(0, ...journal.entries.map((e) => e.when));
}

function latestAppliedMigration(client: Database.Database): number {
  const table = client
    .prepare("select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  if (!table) return 0;
  const row = client.prepare('select max(created_at) as at from __drizzle_migrations').get() as { at: number | null };
  return row.at ?? 0;
}

export function openDb(options: OpenDbOptions = {}): HlabsDb {
  const file = options.file ?? join(options.dataDir ?? '.', 'hlabs.db');
  const migrationsDir = options.migrationsDir ?? MIGRATIONS_DIR;
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const client = new Database(file);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  client.pragma('busy_timeout = 5000');
  const db = drizzle(client, { schema }) as HlabsDb;

  try {
    if (latestAppliedMigration(client) > latestKnownMigration(migrationsDir)) {
      throw new SchemaTooNewError('The database was created by a newer version of hlabs.');
    }
    migrate(db, { migrationsFolder: migrationsDir });
  } catch (error) {
    client.close();
    if (error instanceof SchemaTooNewError) throw error;
    throw new MigrationFailedError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  return db;
}
