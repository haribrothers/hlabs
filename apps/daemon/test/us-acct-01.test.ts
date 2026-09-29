// US-ACCT-01 · Settings sections depend on role (server side): admin procedures refuse members whatever the UI shows.
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-01', () => {
  it('a member calling an admin procedure gets FORBIDDEN', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.query('storage.summary')).result).toBeDefined();
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    const res = await fetch(`${d.url}/trpc/storage.summary`, { headers: { cookie: d.cookie } });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
  });
});
