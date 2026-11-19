// US-BKP-10 · See the encryption password once (server side): kept in the secret store, never in the database or a
// listing; shown again only after the admin's password, audited as backup.password.export.
import { auditLog, backupDestinations } from '@hlabs/db';
import { dicewarePassword, DICEWARE_WORDS } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon, PASSWORD } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-BKP-10', () => {
  it('generated passwords are six words from the list joined with hyphens', () => {
    const p = dicewarePassword();
    expect(p.split('-')).toHaveLength(6);
    for (const w of p.split('-')) expect(DICEWARE_WORDS).toContain(w);
    expect(new Set(DICEWARE_WORDS).size).toBe(DICEWARE_WORDS.length);
    expect(DICEWARE_WORDS.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    // Numbers past the unbiased limit are skipped.
    let calls = 0;
    const fixed = dicewarePassword(2, (n) =>
      calls++ === 0 ? new Uint32Array(n).fill(0xffffffff) : new Uint32Array(n),
    );
    expect(fixed).toBe(`${DICEWARE_WORDS[0]}-${DICEWARE_WORDS[0]}`);
  });

  it('the password lives in the secret store, never in SQLite or a listing', async () => {
    const t = await backupsDaemon(closers);
    const nas = t.nasDrive();
    const { destinationId } = t.data<{ destinationId: string }>(
      await t.d.mutate('backups.destinations.add', {
        name: 'NAS',
        repoPassword: PASSWORD,
        target: { type: 'network', locationId: nas.id },
      }),
    );
    const row = t.db.select().from(backupDestinations).where(eq(backupDestinations.id, destinationId)).get()!;
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
    expect(await t.s.secrets.get(row.repoPasswordRef)).toBe(PASSWORD);
    expect(JSON.stringify(await t.d.query('backups.destinations.list'))).not.toContain(PASSWORD);
  });

  it('“Show encryption password” needs the admin’s password and is audited', async () => {
    const t = await backupsDaemon(closers);
    const nas = t.nasDrive();
    const { destinationId } = t.data<{ destinationId: string }>(
      await t.d.mutate('backups.destinations.add', {
        name: 'NAS',
        repoPassword: PASSWORD,
        target: { type: 'network', locationId: nas.id },
      }),
    );
    expect(t.code(await t.d.mutate('backups.exportRepoPassword', { destinationId, password: 'not my password' }))).toBe(
      'AUTH_INVALID_PASSWORD',
    );
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.password.export')).all()).toEqual([]);
    const res = await t.d.mutate('backups.exportRepoPassword', { destinationId, password: 'correct horse battery' });
    expect(t.data(res)).toEqual({ repoPassword: PASSWORD });
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.password.export')).all()).toHaveLength(1);
  });
});
