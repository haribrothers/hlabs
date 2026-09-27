import { isFeatureEnabled, SHIPPED_PHASE, type Feature } from '@hlabs/shared';
import { z } from 'zod';
import { io } from '../trpc';
import {
  appIdSchema,
  displayNameSchema,
  empty,
  jobIdsSchema,
  jobRefSchema,
  ok,
  passwordSchema,
  pending,
  totpCodeSchema,
  usernameSchema,
} from './common';

/** Step registry (D-041; 04 `settings.onboarding.step`); only enabled steps are shown. */
export const onboardingStepSchema = z.enum([
  'welcome',
  'system',
  'account',
  'twoFactor',
  'storage',
  'remote',
  'apps',
  'done',
]);

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

/** Steps that wait for a later phase (D-036, D-041). */
const STEP_FEATURE: Partial<Record<OnboardingStep, Feature>> = { remote: 'remoteAccess', apps: 'starterApps' };

/** The steps in order, without those whose phase hasn't shipped. */
export function enabledOnboardingSteps(shippedPhase: number = SHIPPED_PHASE): OnboardingStep[] {
  return onboardingStepSchema.options.filter((step) => {
    const feature = STEP_FEATURE[step];
    return !feature || isFeatureEnabled(feature, shippedPhase);
  });
}

/** The next enabled step ('done' after the last one). */
export function nextOnboardingStep(step: OnboardingStep, shippedPhase: number = SHIPPED_PHASE): OnboardingStep {
  const steps = enabledOnboardingSteps(shippedPhase);
  return steps[steps.indexOf(step) + 1] ?? 'done';
}

/** The steps the Stepper counts: "Step N of M" (US-ONB-03). Welcome and done aren't counted. */
export function stepperOnboardingSteps(shippedPhase: number = SHIPPED_PHASE): OnboardingStep[] {
  return enabledOnboardingSteps(shippedPhase).filter((step) => step !== 'welcome' && step !== 'done');
}

/** Steps `onboarding.setStep` may move past without doing anything. Skippable steps join as their stories ship. */
export const SKIPPABLE_ONBOARDING_STEPS: readonly OnboardingStep[] = ['welcome'];

export const onboarding = {
  /** Public: never returns user data (US-ONB-01, US-ONB-03). */
  status: io(empty, z.object({ completed: z.boolean(), step: onboardingStepSchema, hasUsers: z.boolean() })),
  checkSystem: io(z.object({ includeLog: z.boolean().optional() }).optional(), pending),
  confirmSystem: io(z.object({ startAtLogin: z.boolean() }), ok),
  installEngine: io(empty, jobRefSchema),
  setStep: io(z.object({ step: onboardingStepSchema }), ok),
  createAdmin: io(
    z.object({ username: usernameSchema, displayName: displayNameSchema, password: passwordSchema }),
    z.object({ userId: z.string() }),
  ),
  setupTotp: io(empty, z.object({ otpauthUrl: z.string(), qrSvg: z.string(), secret: z.string() })),
  confirmTotp: io(z.object({ code: totpCodeSchema }), z.object({ recoveryCodes: z.array(z.string()) })),
  setStorage: io(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('local'), path: z.string().optional() }),
      z.object({ kind: z.literal('external'), path: z.string() }),
      z.object({
        kind: z.literal('nas'),
        protocol: z.enum(['smb', 'nfs']),
        host: z.string(),
        share: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
      }),
    ]),
    ok,
  ),
  connectRemote: io(empty, pending),
  installStarterApps: io(z.object({ appIds: z.array(appIdSchema) }), jobIdsSchema),
  findBackups: io(empty, pending),
  listRestorePoints: io(z.object({ destination: pending, password: passwordSchema }), pending),
  restoreFromBackup: io(pending, jobRefSchema),
  complete: io(empty, z.object({ redirectTo: z.string() })),
};
