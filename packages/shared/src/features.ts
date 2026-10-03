// Phase gating (D-036): a control that needs a later phase is hidden until that phase ships.
// Bump SHIPPED_PHASE when a phase's "Done when" list is true (docs/prd/10-phases.md); BUILDING_PHASE moves to the next
// phase when its first story starts (D-092), so dev and e2e never preview controls nobody has built yet.
export const SHIPPED_PHASE = 3;
/** The phase being built: the dashboard's dev server (pnpm dev, e2e) previews it (D-092). */
export const BUILDING_PHASE = 4;

/** Set by the dashboard's Vite dev server only (HLABS_PREVIEW_PHASE, else BUILDING_PHASE); never in a build. */
declare const __HLABS_PREVIEW_PHASE__: number | null | undefined;

/**
 * The phase whose controls show: SHIPPED_PHASE in builds, unit tests and the daemon; the previewed phase on the
 * dashboard's dev server, so a phase's work can be used and tested before it ships (D-092).
 */
export const VISIBLE_PHASE: number =
  typeof __HLABS_PREVIEW_PHASE__ === 'undefined' || __HLABS_PREVIEW_PHASE__ === null
    ? SHIPPED_PHASE
    : Math.max(SHIPPED_PHASE, __HLABS_PREVIEW_PHASE__);

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
  /** "Uninstall hlabs…" in the tray (US-INST-21, US-INST-22). */
  uninstall: 6,
  files: 5,
  notifications: 7,
  /** The App Store updates list (F-STORE-08) and the Dock's update badge (US-HOME-05). */
  appUpdates: 7,
  /** "Update all" in Settings › Updates (US-SYS-25). */
  updateAll: 7,
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
  /** The certificate guide (F-SYS-03): "Get certificate" in Network & remote access. */
  certGuide: 9,
  moveAllData: 9,
  engineSwitch: 9,
  /** App settings tabs (US-APP-04): Configuration, Permissions and Usage (F-APP-05…07). */
  appConfig: 7,
  appPermissions: 7,
  appUsage: 7,
  /** Settings sections (US-ACCT-01): Storage and Advanced (phase 7), About (8), Notification preferences (9). */
  storageSettings: 7,
  advancedSettings: 7,
  about: 8,
  notificationPrefs: 9,
} as const satisfies Record<string, number>;

export type Feature = keyof typeof FEATURE_PHASE;

export function isFeatureEnabled(feature: Feature, shippedPhase: number = VISIBLE_PHASE): boolean {
  return FEATURE_PHASE[feature] <= shippedPhase;
}
