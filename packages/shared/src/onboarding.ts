// The onboarding step registry (D-041; 04 `settings.onboarding.step`), shared by the daemon and the dashboard.
import { isFeatureEnabled, SHIPPED_PHASE, type Feature } from './features';

export const ONBOARDING_STEPS = [
  'welcome',
  'system',
  'account',
  'twoFactor',
  'storage',
  'remote',
  'apps',
  'done',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const isOnboardingStep = (value: unknown): value is OnboardingStep =>
  (ONBOARDING_STEPS as readonly unknown[]).includes(value);

/** Steps that wait for a later phase (D-036, D-041). */
const STEP_FEATURE: Partial<Record<OnboardingStep, Feature>> = { remote: 'remoteAccess', apps: 'starterApps' };

/** The steps in order, without those whose phase hasn't shipped. */
export function enabledOnboardingSteps(shippedPhase: number = SHIPPED_PHASE): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => {
    const feature = STEP_FEATURE[step];
    return !feature || isFeatureEnabled(feature, shippedPhase);
  });
}

/** The steps the Stepper counts: "Step N of M" (US-ONB-03). Welcome and done aren't counted. */
export function stepperOnboardingSteps(shippedPhase: number = SHIPPED_PHASE): OnboardingStep[] {
  return enabledOnboardingSteps(shippedPhase).filter((step) => step !== 'welcome' && step !== 'done');
}

/** The next enabled step ('done' after the last one). */
export function nextOnboardingStep(step: OnboardingStep, shippedPhase: number = SHIPPED_PHASE): OnboardingStep {
  const steps = enabledOnboardingSteps(shippedPhase);
  return steps[steps.indexOf(step) + 1] ?? 'done';
}

/** Steps `onboarding.setStep` may move past without doing anything. Skippable steps join as their stories ship. */
export const SKIPPABLE_ONBOARDING_STEPS: readonly OnboardingStep[] = ['welcome'];
