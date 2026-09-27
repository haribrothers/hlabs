// Onboarding routes and where to resume (US-ONB-03, D-041). The server's saved step is the source of truth.
import { enabledOnboardingSteps, onboardingStepSchema, type OnboardingStep } from '@hlabs/api/schemas';
import { SETUP_PATH } from '../lib/setup-token';

/** `/setup` is the welcome screen; every other step lives at `/setup/<step>`. */
export const stepPath = (step: OnboardingStep): string => (step === 'welcome' ? SETUP_PATH : `${SETUP_PATH}/${step}`);

/** The step a pathname asks for, 'unknown' for a path under /setup that isn't a step, null outside /setup. */
export function stepFromPath(pathname: string): OnboardingStep | 'unknown' | null {
  if (pathname === SETUP_PATH || pathname === `${SETUP_PATH}/`) return 'welcome';
  if (!pathname.startsWith(`${SETUP_PATH}/`)) return null;
  const parsed = onboardingStepSchema.safeParse(pathname.slice(SETUP_PATH.length + 1).replace(/\/$/, ''));
  return parsed.success && parsed.data !== 'welcome' ? parsed.data : 'unknown';
}

/**
 * Where to send the browser instead of `pathname`, or null to stay. Opening setup (a fresh page load of
 * /setup, `entry`) resumes at the saved step; a step later than the saved one, a disabled step or an unknown
 * path goes back to the saved step; earlier steps stay reachable with Back.
 */
export function resumePath(opts: {
  pathname: string;
  saved: OnboardingStep;
  entry: boolean;
  shippedPhase?: number;
}): string | null {
  const { saved } = opts;
  const requested = stepFromPath(opts.pathname);
  if (requested === null) return stepPath(saved);
  const steps = enabledOnboardingSteps(opts.shippedPhase);
  if (requested === 'unknown' || !steps.includes(requested)) return stepPath(saved);
  if (opts.entry && requested === 'welcome' && saved !== 'welcome') return stepPath(saved);
  const savedIndex = steps.indexOf(saved);
  if (savedIndex >= 0 && steps.indexOf(requested) > savedIndex) return stepPath(saved);
  return null;
}
