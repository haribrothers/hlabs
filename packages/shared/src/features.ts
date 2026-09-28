// Phase gating (D-036): a control that needs a later phase is hidden until that phase ships.
// Bump SHIPPED_PHASE when a phase's "Done when" list is true (docs/prd/10-phases.md).
export const SHIPPED_PHASE = 0;

/** The phase that delivers each gated capability. */
export const FEATURE_PHASE = {
  onboarding: 1,
  signIn: 1,
  /** ForgotPassword (US-AUTH-20): the tray and CLI resets it explains ship in phase 4. */
  forgotPassword: 4,
  apps: 2,
  starterApps: 2,
  appStore: 2,
  search: 2,
  remoteAccess: 3,
  people: 3,
  tray: 4,
  startAtLogin: 4,
  liveUsage: 4,
  hlabsUpdates: 4,
  backups: 5,
  files: 5,
  notifications: 7,
  homeEdit: 7,
  widgets: 7,
  storeSources: 7,
  appearance: 7,
  factoryReset: 7,
  pwa: 7,
  restoreInOnboarding: 8,
  deployCustom: 8,
  moveAppData: 8,
  networkShares: 8,
  trashScreen: 8,
  aiAccess: 8,
  renameServer: 9,
  moveAllData: 9,
  engineSwitch: 9,
} as const satisfies Record<string, number>;

export type Feature = keyof typeof FEATURE_PHASE;

export function isFeatureEnabled(feature: Feature, shippedPhase: number = SHIPPED_PHASE): boolean {
  return FEATURE_PHASE[feature] <= shippedPhase;
}
