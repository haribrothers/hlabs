// A sign-in from a new place (US-SYS-46, D-182, 07 §7.11 control 4): after someone signs in on the public dashboard
// from a network address they haven't signed in from in the last 30 days (their own `auth.login.succeeded` entries in
// audit_log), they get a warning with "Sign out everywhere", and it's recorded. The country is Cloudflare's, for the
// message (D-183).
import type { NotificationAction } from '@hlabs/api';
import { auditLog, type HlabsDb } from '@hlabs/db';
import { TOAST_MUTATIONS, ulid } from '@hlabs/shared';
import { and, eq, gte } from 'drizzle-orm';
import type { EventBus } from '../events/bus';
import { createNotification } from '../notifications/service';

/** How far back the places someone has signed in from count as known. */
export const KNOWN_PLACE_MS = 30 * 24 * 60 * 60 * 1000;

const regions = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** "the Netherlands"-style names from Cloudflare's two-letter code; the code itself when it isn't a country. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    const name = regions?.of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

/**
 * Called once a sign-in on the public dashboard has made its session (its `auth.login.succeeded` already written):
 * true, with the notification sent, when the address is new for this person in the last 30 days.
 */
export function noteSignInPlace(
  db: HlabsDb,
  bus: EventBus,
  opts: { userId: string; ip: string; country: string | null; publicHost: string; now?: number },
): boolean {
  const now = opts.now ?? Date.now();
  const seen = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, opts.userId),
        eq(auditLog.action, 'auth.login.succeeded'),
        eq(auditLog.ip, opts.ip),
        gte(auditLog.at, now - KNOWN_PLACE_MS),
      ),
    )
    .all().length;
  // The sign-in that just happened is one of them.
  if (seen > 1) return false;
  db.insert(auditLog)
    .values({
      id: ulid(),
      at: now,
      userId: opts.userId,
      action: 'auth.login.newPlace',
      target: opts.userId,
      detailJson: { ip: opts.ip, country: opts.country, publicHost: opts.publicHost },
      ip: opts.ip,
    })
    .run();
  const actions: NotificationAction[] = [];
  // "Sign out everywhere" from the notification itself, once the dashboard allows that mutation from a toast; until
  // then the button opens the sessions in Settings › Account.
  if ((TOAST_MUTATIONS as readonly string[]).includes('auth.revokeOtherSessions')) {
    actions.push({
      kind: 'mutation',
      procedure: 'auth.revokeOtherSessions' as (typeof TOAST_MUTATIONS)[number],
      input: {},
      label: 'Sign out everywhere',
    });
  } else actions.push({ kind: 'navigate', to: '/settings/account' });
  const where = countryName(opts.country);
  createNotification(db, bus, {
    userId: opts.userId,
    kind: 'account.new_sign_in',
    target: opts.userId,
    severity: 'warning',
    title: `New sign-in to hlabs from ${where ? `${where} (${opts.ip})` : opts.ip}`,
    body: `Someone signed in as you at ${opts.publicHost}. Not you? Sign out everywhere.`,
    actions,
    now,
  });
  return true;
}
