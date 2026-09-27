// What the dashboard shows before onboarding is complete (US-ONB-01).
import { SETUP_PATH } from '../lib/setup-token';

export interface OnboardingStatus {
  completed: boolean;
}

export type FirstRunView =
  | { kind: 'loading' }
  /** The dashboard as usual. */
  | { kind: 'app' }
  /** The onboarding flow. */
  | { kind: 'setup' }
  /** No setup token in this browser: setup must be finished on the computer running hlabs. */
  | { kind: 'elsewhere' }
  | { kind: 'redirect'; to: string };

/** `/setup` and every step under it (`/setup/<step>`). */
export const isSetupPath = (pathname: string) => pathname === SETUP_PATH || pathname.startsWith(`${SETUP_PATH}/`);

export function firstRunView(opts: {
  pathname: string;
  status: OnboardingStatus | undefined;
  /** The status query failed (the daemon-down states handle that). */
  failed: boolean;
  hasSetupToken: boolean;
  /** Development pages under /dev stay reachable. */
  dev: boolean;
}): FirstRunView {
  const { pathname, status } = opts;
  if (opts.dev && pathname.startsWith('/dev/')) return { kind: 'app' };
  if (!status) return opts.failed ? { kind: 'app' } : { kind: 'loading' };
  if (status.completed) return isSetupPath(pathname) ? { kind: 'redirect', to: '/' } : { kind: 'app' };
  if (!opts.hasSetupToken) return { kind: 'elsewhere' };
  return isSetupPath(pathname) ? { kind: 'setup' } : { kind: 'redirect', to: SETUP_PATH };
}
