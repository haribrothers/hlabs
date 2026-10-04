// The accounts "Reset a password…" offers (US-INST-17): every enabled account, admins first, then alphabetical by
// display name, with whether two-factor is on (the window then offers to turn it off too).
import type { TrayUser } from '@hlabs/api';
import { users, userTotp, type HlabsDb } from '@hlabs/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

export function trayUsers(db: HlabsDb): TrayUser[] {
  const withTotp = new Set(
    db
      .select({ userId: userTotp.userId })
      .from(userTotp)
      .where(isNotNull(userTotp.enabledAt))
      .all()
      .map((r) => r.userId),
  );
  return db
    .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role })
    .from(users)
    .where(isNull(users.disabledAt))
    .all()
    .map((u) => ({ ...u, totpEnabled: withTotp.has(u.id) }))
    .sort(
      (a, b) =>
        (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) ||
        a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }) ||
        a.username.localeCompare(b.username),
    );
}

/** One enabled account by username, or undefined. */
export function trayUser(db: HlabsDb, username: string): TrayUser | undefined {
  const user = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), isNull(users.disabledAt)))
    .get();
  return user ? trayUsers(db).find((u) => u.id === user.id) : undefined;
}
