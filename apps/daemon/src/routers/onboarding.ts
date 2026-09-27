import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';

export const onboarding: AppHandlers<DaemonContext>['onboarding'] = {
  status: (_input, ctx) => ctx.services.onboarding.status(),
  checkSystem: (_input, ctx) => ctx.services.onboarding.checkSystem(),
  confirmSystem: async ({ startAtLogin }, ctx) => {
    await ctx.services.onboarding.confirmSystem(startAtLogin);
    return { ok: true };
  },
  setStep: ({ step }, ctx) => {
    ctx.services.onboarding.setStep(step);
    return { ok: true };
  },
};
