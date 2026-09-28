// A signed-in person as auth.me returns them, for component tests.
export function fakeMe(overrides: Record<string, unknown> = {}) {
  return () => ({
    id: 'u1',
    username: 'hari',
    displayName: 'Hari',
    role: 'admin',
    avatarColor: 'violet',
    locale: 'en',
    mustSetupTotp: false,
    totpEnabled: false,
    canSeeUsage: true,
    canInstallApps: true,
    remember: false,
    appearance: {
      wallpaper: 'dusk',
      accent: 'violet',
      reduceTransparency: false,
      reduceMotion: false,
      showWidgets: true,
      showGreeting: true,
    },
    csrfToken: 't',
    ...overrides,
  });
}
