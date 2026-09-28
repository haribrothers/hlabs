// What the dashboard shows before onboarding is complete (US-ONB-01, US-ONB-03).
import type { OnboardingStep } from '@hlabs/shared';
import { TWO_FACTOR_MANAGE_PATH } from '../lib/paths';
import { SETUP_PATH } from '../lib/setup-token';
import { resumePath } from './steps';

export interface OnboardingStatus {
  completed: boolean;
  step: OnboardingStep;
}

export type FirstRunView =
  | { kind: 'loading' }
  /** The dashboard as usual. */
  | { kind: 'app' }
  /** The onboarding flow. */
  | { kind: 'setup' }
  /** A page without the Dock: the log-in screens. */
  | { kind: 'plain' }
  /** No setup token in this browser: setup must be finished on the computer running hlabs. */
  | { kind: 'elsewhere' }
  | { kind: 'redirect'; to: string; search?: { next: string } };

/** `/setup` and every step under it (`/setup/<step>`). */
export const isSetupPath = (pathname: string) => pathname === SETUP_PATH || pathname.startsWith(`${SETUP_PATH}/`);

/** `/login` and its views. */
export const isLoginPath = (pathname: string) => pathname === '/login' || pathname.startsWith('/login/');

export function firstRunView(opts: {
  pathname: string;
  status: OnboardingStatus | undefined;
  /** The status query failed (the daemon-down states handle that). */
  failed: boolean;
  hasSetupToken: boolean;
  /** Development pages under /dev stay reachable. */
  dev: boolean;
  /** First page load of this tab: opening setup resumes at the saved step. */
  entry?: boolean;
  shippedPhase?: number;
  /** The admin requires two-factor and this account has none yet (US-AUTH-10). */
  mustSetupTotp?: boolean;
}): FirstRunView {
  const { pathname, status } = opts;
  if (opts.dev && pathname.startsWith('/dev/')) return { kind: 'app' };
  if (!status) return opts.failed ? { kind: 'app' } : { kind: 'loading' };
  if (status.completed) {
    // The finish screen stays up when setup completes in this tab; loading it afterwards goes home (US-ONB-22).
    if (pathname === `${SETUP_PATH}/done` && !opts.entry) return { kind: 'setup' };
    if (isSetupPath(pathname)) return { kind: 'redirect', to: '/' };
    // Everything but two-factor setup (and the log-in screens) waits until it's done, then goes on to where it was.
    if (opts.mustSetupTotp && pathname !== TWO_FACTOR_MANAGE_PATH && !isLoginPath(pathname)) {
      return {
        kind: 'redirect',
        to: TWO_FACTOR_MANAGE_PATH,
        ...(pathname === '/' ? {} : { search: { next: pathname } }),
      };
    }
    return isLoginPath(pathname) ? { kind: 'plain' } : { kind: 'app' };
  }
  if (!opts.hasSetupToken) return { kind: 'elsewhere' };
  const to = resumePath({ pathname, saved: status.step, entry: opts.entry ?? false, shippedPhase: opts.shippedPhase });
  return to && to !== pathname ? { kind: 'redirect', to } : { kind: 'setup' };
}
