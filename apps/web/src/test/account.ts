// Settings › Account as account.get returns it, for component tests.
export function fakeAccount(overrides: Record<string, unknown> = {}) {
  return () => ({
    id: 'u1',
    username: 'hari',
    displayName: 'Hari',
    role: 'admin',
    avatarColor: 'violet',
    locale: 'en',
    passwordChangedAt: null,
    totpEnabledAt: null,
    recoveryCodesUnused: 0,
    recoveryCodesUsed: [],
    totpAddedDuringSetup: false,
    totpRequired: false,
    hostname: 'hlabs',
    homeFolderBytes: null,
    adminName: 'Hari',
    ...overrides,
  });
}

/** Two-factor on with 10 codes, `used` of them used (the first ones). */
export function twoFactorOn(used = 0, overrides: Record<string, unknown> = {}) {
  return fakeAccount({
    totpEnabledAt: Date.UTC(2026, 8, 1),
    recoveryCodesUnused: 10 - used,
    recoveryCodesUsed: Array.from({ length: 10 }, (_, i) => i < used),
    ...overrides,
  });
}
