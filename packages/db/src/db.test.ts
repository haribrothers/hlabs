import { eq } from 'drizzle-orm';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, MigrationFailedError, openDb, SchemaTooNewError, type HlabsDb } from './db';
import { backupPlan, storageLocations, users } from './schema/index';
import { getSetting, getUserSetting, setSetting, setUserSetting } from './settings';

const opened: HlabsDb[] = [];
function fresh(dir = mkdtempSync(join(tmpdir(), 'hlabs-db-'))): { db: HlabsDb; dir: string } {
  const db = openDb({ dataDir: dir });
  opened.push(db);
  return { db, dir };
}
afterEach(() => {
  for (const db of opened.splice(0)) if (db.$client.open) db.$client.close();
});

const user = (id: string, username: string) => ({
  id,
  username,
  displayName: username,
  role: 'admin' as const,
  passwordHash: 'x',
  createdAt: 1,
});

describe('openDb', () => {
  it('creates every table from 04-data-model on a fresh data dir, in WAL mode', () => {
    const { db } = fresh();
    const tables = db.$client
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like '\\_%' escape '\\' and name != 'sqlite_sequence'",
      )
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();
    expect(tables).toEqual(
      [
        'app_access',
        'app_env',
        'app_mounts',
        'app_sources',
        'apps',
        'audit_log',
        'backup_destinations',
        'backup_plan',
        'backup_runs',
        'catalog_apps',
        'file_shares',
        'home_layout',
        'invite_app_access',
        'invites',
        'jobs',
        'login_attempts',
        'mcp_tokens',
        'notifications',
        'password_resets',
        'recovery_codes',
        'restores',
        'sessions',
        'settings',
        'storage_locations',
        'trash_items',
        'upload_sessions',
        'usage_samples',
        'user_totp',
        'users',
      ].sort(),
    );
    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('is idempotent across restarts', () => {
    const { dir, db } = fresh();
    db.insert(users).values(user('01A', 'hari')).run();
    db.$client.close();
    const again = fresh(dir).db;
    expect(again.select().from(users).all()).toHaveLength(1);
  });

  it('refuses a database written by a newer hlabs', () => {
    const { dir, db } = fresh();
    db.$client.prepare('update __drizzle_migrations set created_at = created_at + 1000').run();
    db.$client.close();
    expect(() => openDb({ dataDir: dir })).toThrow(SchemaTooNewError);
  });

  it('rolls back and reports a failed migration', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'hlabs-mig-'));
    cpSync(MIGRATIONS_DIR, migrationsDir, { recursive: true });
    const journalPath = join(migrationsDir, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.entries.push({ idx: 1, version: '6', when: Date.now() + 1e9, tag: '0001_broken', breakpoints: true });
    writeFileSync(journalPath, JSON.stringify(journal));
    writeFileSync(
      join(migrationsDir, '0001_broken.sql'),
      'CREATE TABLE `half_done` (`id` text);\n--> statement-breakpoint\nTHIS IS NOT SQL;',
    );
    const dir = mkdtempSync(join(tmpdir(), 'hlabs-db-'));
    expect(() => openDb({ dataDir: dir, migrationsDir })).toThrow(MigrationFailedError);
    const db = fresh(dir).db;
    const halfDone = db.$client.prepare("select name from sqlite_master where name = 'half_done'").get();
    expect(halfDone).toBeUndefined();
  });
});

describe('constraints', () => {
  it('allows at most one storage root', () => {
    const { db } = fresh();
    const loc = (id: string) => ({ id, kind: 'local' as const, name: id, path: `/${id}`, isRoot: true });
    db.insert(storageLocations).values(loc('a')).run();
    expect(() => db.insert(storageLocations).values(loc('b')).run()).toThrow(/UNIQUE/);
    db.insert(storageLocations)
      .values({ ...loc('c'), isRoot: false })
      .run();
  });

  it('keeps backup_plan a singleton with the documented defaults', () => {
    const { db } = fresh();
    db.insert(backupPlan).values({}).run();
    expect(db.select().from(backupPlan).get()).toMatchObject({
      scheduleCron: '0 3 * * *',
      retentionJson: { daily: 7, weekly: 4, monthly: 6 },
      pauseApps: true,
    });
    expect(() => db.insert(backupPlan).values({ id: 2 }).run()).toThrow(/CHECK/);
  });

  it('cascades user deletes to sessions', () => {
    const { db } = fresh();
    db.insert(users).values(user('01A', 'hari')).run();
    db.$client
      .prepare('insert into sessions (id, user_id, created_at, last_seen_at, expires_at) values (?, ?, 1, 1, 2)')
      .run('s1', '01A');
    db.delete(users).where(eq(users.id, '01A')).run();
    expect(db.$client.prepare('select count(*) as n from sessions').get()).toEqual({ n: 0 });
  });
});

describe('settings', () => {
  it('returns defaults when unset', () => {
    const { db } = fresh();
    expect(getSetting(db, 'hostname')).toBe('hlabs');
    expect(getSetting(db, 'people')).toEqual({
      showUserList: true,
      requireTotp: false,
      membersCanInstall: false,
      membersCanSeeUsage: false,
    });
    expect(getSetting(db, 'network').ports).toEqual({ https: 443, http: 80 });
    expect(getSetting(db, 'paused')).toBeNull();
  });

  it('round-trips and fills partial values with defaults', () => {
    const { db } = fresh();
    setSetting(db, 'updates', { channel: 'beta' });
    expect(getSetting(db, 'updates')).toEqual({
      channel: 'beta',
      autoHlabs: true,
      autoApps: false,
      backupBeforeUpdate: true,
    });
  });

  it('rejects invalid values on write and ignores corrupt rows on read', () => {
    const { db } = fresh();
    expect(() => setSetting(db, 'hostname', 'Not Valid')).toThrow();
    db.$client.prepare("insert into settings (key, value_json) values ('startup', '\"garbage\"')").run();
    expect(getSetting(db, 'startup')).toEqual({ startAtLogin: true, autostartApps: true, keepAwake: false });
  });

  it('keeps appearance per user (D-010)', () => {
    const { db } = fresh();
    setUserSetting(db, 'appearance', 'u1', { accent: 'mint' });
    expect(getUserSetting(db, 'appearance', 'u1').accent).toBe('mint');
    expect(getUserSetting(db, 'appearance', 'u2').accent).toBe('violet');
  });
});
