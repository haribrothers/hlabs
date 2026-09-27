import { hlabsError, type AppHandlers } from '@hlabs/api';
import { sessionCookie } from '../auth/sessions';
import type { DaemonContext } from '../context';
import { createAdmin } from '../onboarding/create-admin';

/** Setup procedures after the admin exists run on their session (checked in DaemonContext.authorize). */
function signedInUser(ctx: DaemonContext): string {
  const id = ctx.identity;
  if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
  return id.userId;
}

export const onboarding: AppHandlers<DaemonContext>['onboarding'] = {
  status: (_input, ctx) => ctx.services.onboarding.status(),
  checkSystem: (input, ctx) => ctx.services.onboarding.checkSystem({ includeLog: input?.includeLog }),
  installEngine: async (_input, ctx) => ({ jobId: await ctx.services.onboarding.installEngine() }),
  confirmSystem: async ({ startAtLogin }, ctx) => {
    await ctx.services.onboarding.confirmSystem(startAtLogin);
    return { ok: true };
  },
  /** Creates the admin and signs them in on this browser (not "remember me"). */
  createAdmin: async ({ username, displayName, password }, ctx) => {
    const { db, sessions } = ctx.services;
    const userId = await createAdmin(db, { username, displayName, password, ip: ctx.request.ip });
    const session = sessions.create({ userId, ip: ctx.request.ip, userAgent: ctx.request.userAgent });
    ctx.request.setCookie(sessionCookie(session.raw, session));
    return { userId };
  },
  /** A new pending secret for the signed-in admin; a reload replaces it (US-ONB-11). */
  setupTotp: (_input, ctx) => ctx.services.totp.begin(signedInUser(ctx)),
  confirmTotp: async ({ code }, ctx) => ({
    recoveryCodes: await ctx.services.totp.confirm(signedInUser(ctx), code, { ip: ctx.request.ip }),
  }),
  setStep: ({ step }, ctx) => {
    ctx.services.onboarding.setStep(step);
    return { ok: true };
  },
};
