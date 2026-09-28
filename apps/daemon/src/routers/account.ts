import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { changePassword, getAccount, updateAccount } from '../account/account';
import type { DaemonContext } from '../context';

const userOf = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
  return id.userId;
};

export const account: AppHandlers<DaemonContext>['account'] = {
  get: (_input, ctx) => getAccount(ctx.services.db, userOf(ctx)),
  changePassword: async (input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    await changePassword(ctx.services.db, ctx.services, { userId: id.userId, sessionId: id.session.id }, input, {
      ip: ctx.request.ip,
    });
    return { ok: true as const };
  },
  totp: {
    /** Start turning two-factor on, or moving it to a new phone (US-ACCT-11, US-ACCT-12), after the password. */
    begin: async ({ password }, ctx) => {
      const userId = userOf(ctx);
      const { db, login, totp } = ctx.services;
      const user = db.select().from(users).where(eq(users.id, userId)).get();
      if (!user) throw hlabsError('AUTH_REQUIRED');
      await login.confirmPassword({ user, password, action: 'totp.begin', ip: ctx.request.ip });
      return totp.begin(userId, { move: totp.isEnabled(userId) });
    },
    confirm: async ({ code }, ctx) => ({
      recoveryCodes: await ctx.services.totp.confirm(userOf(ctx), code, { ip: ctx.request.ip }),
    }),
  },
  recoveryCodes: {
    /** New codes after confirming the password (US-ACCT-10); a wrong password counts toward the log-in lockout. */
    regenerate: async ({ password }, ctx) => {
      const userId = userOf(ctx);
      const { db, login, totp } = ctx.services;
      const user = db.select().from(users).where(eq(users.id, userId)).get();
      if (!user) throw hlabsError('AUTH_REQUIRED');
      await login.confirmPassword({ user, password, action: 'recoveryCodes.regenerate', ip: ctx.request.ip });
      return { recoveryCodes: await totp.regenerateRecoveryCodes(userId, { ip: ctx.request.ip }) };
    },
  },
  update: (input, ctx) => {
    updateAccount(ctx.services.db, userOf(ctx), input, { ip: ctx.request.ip });
    return { ok: true as const };
  },
};
