import { hlabsError, type AppHandlers } from '@hlabs/api';
import { sessionCookie } from '../auth/sessions';
import type { DaemonContext } from '../context';
import { createAdmin } from '../onboarding/create-admin';
import { setExternalStorage, setNetworkStorage, setStorageRoot } from '../onboarding/storage';

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
  /** This computer (US-ONB-14), an external drive (US-ONB-15) or a network share (US-ONB-16). */
  setStorage: async (input, ctx) => {
    const { db, drives, config } = ctx.services;
    const userId = signedInUser(ctx);
    if (input.kind === 'local') {
      await setStorageRoot(db, { userId, kind: 'local', name: 'This computer', path: config.paths.storageRootDefault });
    } else if (input.kind === 'external') {
      await setExternalStorage(db, drives, { userId, path: input.path });
    } else {
      await setNetworkStorage(db, { userId, locationId: input.locationId });
    }
    return { ok: true };
  },
  complete: async (_input, ctx) => {
    await ctx.services.onboarding.complete({ userId: signedInUser(ctx), ip: ctx.request.ip });
    return { redirectTo: '/' };
  },
  setStep: ({ step }, ctx) => {
    const { onboarding, totp } = ctx.services;
    const leavingTwoFactor = onboarding.status().step === 'twoFactor' && step !== 'twoFactor';
    onboarding.setStep(step);
    // Skip for now: a secret shown but never confirmed is thrown away (US-ONB-13).
    if (leavingTwoFactor && ctx.identity.kind === 'user') totp.discard(ctx.identity.userId);
    return { ok: true };
  },
};
